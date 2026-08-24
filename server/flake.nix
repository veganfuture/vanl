{
  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
  inputs.disko.url = "github:nix-community/disko";
  inputs.disko.inputs.nixpkgs.follows = "nixpkgs";

  # Path inputs (not git+file:) - simplest for a single-admin deployment run from the admin's
  # own checkout; a `nixos-rebuild switch --target-host` always reflects whatever's currently on
  # disk in bot/ and web/, including uncommitted changes. nixpkgs.follows on each unifies all
  # three flakes onto this flake's own nixpkgs evaluation, so the deployed closure doesn't end
  # up with three separately-pinned copies of common dependencies (bash, coreutils, etc.) - the
  # same pattern already used for disko above. This only affects the *composed*
  # nixosConfigurations evaluation; `nix develop ./bot`/`nix develop ./web` standalone still use
  # their own independently-pinned nixpkgs, unaffected.
  inputs.bot.url = "path:../bot";
  inputs.bot.inputs.nixpkgs.follows = "nixpkgs";
  inputs.web.url = "path:../web";
  inputs.web.inputs.nixpkgs.follows = "nixpkgs";

  outputs = {
    nixpkgs,
    disko,
    bot,
    web,
    ...
  }: let
    system = "x86_64-linux";
    pkgs = import nixpkgs {inherit system;};

    # web-deps'/bot-deps' FODs bake in patchShebangs-rewritten store paths, so their real
    # outputHash depends on which nixpkgs revision builds them - this flake's own composed,
    # nixpkgs.follows-applied evaluation is the one that actually matters for deployment, and
    # differs from bot/web's own independently-locked nixpkgs when built standalone. These
    # passthroughs + apps let `nix run .#update-web-deps-hash` / `.#update-bot-venv-hash` (run
    # from server/) recompute against the *correct* evaluation whenever bun.lock/uv.lock change,
    # or whenever this flake's own nixpkgs input is updated.
    webDepsHashCheck = web.packages.${system}.web-deps-hash-check;
    botDepsHashCheck = bot.packages.${system}.bot-deps-hash-check;

    mkUpdateHashApp = name: check:
      pkgs.writeShellScriptBin "update-${name}-hash" ''
        set -euo pipefail
        echo "Computing ${name}'s real dependency hash (this will intentionally fail once)..." >&2
        if out=$(nix build --no-link --print-out-paths '.#${name}-hash-check' 2>&1); then
          echo "Hash check unexpectedly succeeded - nothing to update?" >&2
          exit 1
        fi
        real_hash=$(printf '%s\n' "$out" | grep -oP '(?<=got:\s{7})\S+' || true)
        if [ -z "$real_hash" ]; then
          echo "Could not find the real hash in nix's error output:" >&2
          echo "$out" >&2
          exit 1
        fi
        echo ""
        echo "New outputHash for ${name} (paste into the relevant flake.nix): $real_hash"
      '';
  in {
    packages.${system} = {
      web-deps-hash-check = webDepsHashCheck;
      bot-deps-hash-check = botDepsHashCheck;
    };

    apps.${system} = {
      update-web-deps-hash = {
        type = "app";
        program = "${mkUpdateHashApp "web-deps" webDepsHashCheck}/bin/update-web-deps-hash";
      };
      update-bot-venv-hash = {
        type = "app";
        program = "${mkUpdateHashApp "bot-deps" botDepsHashCheck}/bin/update-bot-deps-hash";
      };
    };

    nixosConfigurations.vanl-hostkey1 = nixpkgs.lib.nixosSystem {
      inherit system;
      specialArgs = {inherit bot web;};
      modules = [
        disko.nixosModules.disko
        bot.nixosModules.default
        web.nixosModules.default
        ./configuration.nix
        ./hardware-configuration/vanl-hostkey1.nix
      ];
    };
  };
}
