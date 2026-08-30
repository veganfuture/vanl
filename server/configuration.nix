{
  config,
  modulesPath,
  lib,
  pkgs,
  bot,
  web,
  ...
}: {
  imports = [
    (modulesPath + "/installer/scan/not-detected.nix")
    (modulesPath + "/profiles/qemu-guest.nix")
    ./disk-config.nix
  ];
  boot.loader.grub = {
    # no need to set devices, disko will add all devices that have a EF02 partition to the list already
    # devices = [ ];
    efiSupport = true;
    efiInstallAsRemovable = true;
  };

  # Matches the flake attribute `nixosConfigurations.vanl-hostkey1` (and
  # hardware-configuration/vanl-hostkey1.nix's own name) - was "vanl-hostkey" (missing the "1"),
  # a latent mismatch bug fixed here rather than renaming the flake attribute, since more already
  # depends on "vanl-hostkey1".
  networking.hostName = "vanl-hostkey1";
  time.timeZone = "Europe/Amsterdam";

  # SSH clients using terminals NixOS's minimal terminfo doesn't ship (e.g. Ghostty's
  # xterm-ghostty) otherwise get "unknown terminal type" from anything that reads TERM (vim,
  # less, tmux, ...) - installs the full ncurses terminfo db instead of the minimal subset.
  environment.enableAllTerminfo = true;

  environment.systemPackages = map lib.lowPrio [
    pkgs.curl
    pkgs.gitMinimal
    pkgs.vim
  ];

  users.users.lobo = {
    isNormalUser = true;
    extraGroups = ["wheel"];

    openssh.authorizedKeys.keys = [
      "ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIFivXGMLOpHmpZ65nwJ8BoyIo3v79a/hD613wH/D5lhk"
    ];
  };

  nix.settings.trusted-users = ["root" "lobo"];

  security.sudo.wheelNeedsPassword = false;

  services.openssh = {
    enable = true;

    settings = {
      PasswordAuthentication = false;
      KbdInteractiveAuthentication = false;
      PermitRootLogin = "no";
    };
  };

  # No inbound ports needed beyond SSH - the website is reachable exclusively via Cloudflare
  # Tunnel (cloudflared makes an outbound-only connection to Cloudflare's edge; see
  # services.cloudflared below), and the bot doesn't need to be reachable from the internet at
  # all (it only talks outbound to Signal's servers and to the website's local API).
  # TEMPORARY: Cloudflare Tunnel isn't set up yet (see services.cloudflared.enable below), so the
  # web port is opened directly here for testing instead. Revert this once the tunnel exists.
  networking.firewall = {
    enable = true;
    allowedTCPPorts = [22 config.services.vanl-web.port];
  };

  nix.gc = {
    automatic = true;
    dates = "weekly";
    options = "--delete-older-than 30d";
  };

  # --- Postgres, for the website (web/configs/prod.toml expects 127.0.0.1:5432, db/user `vanl`) ---
  services.postgresql = {
    enable = true;
    # web connects over TCP via the `postgres` npm client, not a Unix socket - the module
    # defaults to socket-only, so this must be explicit or nothing will ever connect.
    enableTCPIP = true;
    ensureDatabases = ["vanl"];
    # ensureUsers only ever gives passwordless *peer* auth - it can't set a password (that would
    # land it in the Nix store) - see postgresql-set-vanl-password below for how the actual
    # password gets set, from the admin-managed /etc/vanl/web.env instead.
    ensureUsers = [
      {
        name = "vanl";
        ensureDBOwnership = true;
      }
    ];
    # mkAfter, not an outright override - must not clobber the module's own default `peer` rule,
    # which it needs for its own bootstrapping (ensureUsers/ensureDatabases activation).
    authentication = lib.mkAfter ''
      host  vanl  vanl  127.0.0.1/32  scram-sha-256
      host  vanl  vanl  ::1/128       scram-sha-256
    '';
  };

  # ensureUsers can't set a password without landing it in the Nix store, and decision #3
  # (plain EnvironmentFile secrets, no sops-nix) rules out the usual encrypted-secret options -
  # so this idempotent oneshot sets it directly from the same admin-managed file vanl-web's own
  # EnvironmentFile uses, safe to re-run on every boot/switch (ALTER ROLE with an unchanged
  # password is a no-op), and doubles as the password-rotation mechanism (edit the file, then
  # `systemctl restart postgresql-set-vanl-password.service`).
  systemd.services.postgresql-set-vanl-password = {
    description = "Set the vanl Postgres role's password from /etc/vanl/web.env";
    after = ["postgresql.service"];
    requires = ["postgresql.service"];
    wantedBy = ["multi-user.target"];
    serviceConfig = {
      Type = "oneshot";
      User = "postgres";
      EnvironmentFile = "/etc/vanl/web.env";
      ExecStart = pkgs.writeShellScript "set-vanl-pg-password" ''
        set -euo pipefail
        ${config.services.postgresql.package}/bin/psql -v ON_ERROR_STOP=1 -c \
          "ALTER ROLE vanl WITH PASSWORD '$VANL_DATABASE_PASSWORD'"
      '';
    };
  };

  # vanl-web must not start serving before its DB password is actually set - NixOS list options
  # concatenate across modules, so this doesn't need to live inside web's own nixosModule.
  systemd.services.vanl-web.after = ["postgresql-set-vanl-password.service"];
  systemd.services.vanl-web.wants = ["postgresql-set-vanl-password.service"];

  # --- Cloudflare Tunnel: the website's only path to the public internet. cloudflared makes an
  # outbound-only connection to Cloudflare's edge, so no inbound port needs to be opened, and no
  # origin TLS is needed either (the tunnel itself is what's encrypted to Cloudflare - traffic
  # from cloudflared to the app stays on loopback). One-time setup (cloudflared tunnel login +
  # create + route dns) is documented in the root README - not Nix-managed. ---
  services.cloudflared = {
    # TEMPORARY: disabled until the one-time tunnel setup (README's "One-time Cloudflare Tunnel
    # setup") is done and the real UUID below is filled in - until then this unit would just
    # restart-loop on the placeholder. The web port is opened directly above in the meantime.
    enable = false;
    # TODO: replace with the real tunnel UUID from `cloudflared tunnel create` (see root
    # README's one-time Cloudflare Tunnel setup section) - this becomes part of a systemd unit
    # name (cloudflared-tunnel-<name>.service), so it must already be a valid unit-name
    # fragment; a real tunnel UUID always is.
    tunnels."REPLACE-WITH-REAL-TUNNEL-UUID" = {
      credentialsFile = "/etc/vanl/cloudflared-credentials.json";
      default = "http_status:404";
      ingress."veganactivists.nl" = "http://127.0.0.1:${toString config.services.vanl-web.port}";
    };
  };

  # Directory for all admin-managed, never-committed secrets (EnvironmentFiles +
  # cloudflared's credentials) - NixOS only ensures the directory exists with sane permissions,
  # the files inside it are entirely admin-authored (decision #3: plain files, no sops-nix).
  systemd.tmpfiles.rules = ["d /etc/vanl 0750 root vanl-secrets"];
  users.groups.vanl-secrets.members = ["postgres" "vanl-bot" "vanl-web"];

  services.vanl-bot = {
    enable = true;
    configFile = "${bot}/configs/prod.toml";
    environmentFile = "/etc/vanl/bot.env"; # must also provide VANL_BOT_SIGNAL_ACCOUNT
  };

  services.vanl-web = {
    enable = true;
    configFile = "${web}/configs/prod.toml";
    environmentFile = "/etc/vanl/web.env";
    # TEMPORARY: defaults to 127.0.0.1 (only reachable via cloudflared on loopback). Bind to all
    # interfaces so the firewall-opened port above is actually reachable without the tunnel.
    # Revert alongside the cloudflared/firewall changes once the tunnel is set up.
    host = "0.0.0.0";
  };

  system.stateVersion = "26.05";
}
