{
  description = "Vegan Activsts NL Signal bot";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    pre-commit-hooks.url = "github:cachix/git-hooks.nix";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    pre-commit-hooks,
  }:
    (flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};
      nixPython = "${pkgs.python312}/bin/python";

      runtimePkgs = with pkgs; [
        git
        nix
        nushell
        python312
        signal-cli
        uv
      ];

      nuShellScript = ''
        #!${pkgs.nushell}/bin/nu

        def required_flags [flags: list<record>] {
          mut msgs: list<string> = []
          for flag in $flags {
            if ($flag.value | is-empty) {
              let env_msg = if ($flag | get -o env) != null { $" or use environment variable $($flag.env)" } else { ""}
              $msgs = ($msgs | append $"Error: Missing required flag: --($flag.name)($env_msg)")
            }
          }
          if ($msgs | length) > 0 {
            print ($msgs | str join (char nl))
            exit 1
          }
        }
      '';

      # Dev-time convenience only (`nix run .#bot` against a live local checkout, or as the
      # foreground half of `nix run .#dev` below) - the production systemd unit no longer uses
      # this at all, see nixosModules.default's bot.service, which execs botVenv's installed
      # console script directly. Still useful standalone when the daemon is already running
      # separately (e.g. iterating on bot code without restarting signal-cli/re-linking its
      # socket).
      runBot = pkgs.writeScriptBin "bot-run" ''
        ${nuShellScript}

        def main [
          --repo-dir: string = "."
          --config: string
        ] {
          required_flags [
            { name: "config", value: $config }
          ]
          let repo_dir = ($repo_dir | path expand)

          let tmp_dir = ($repo_dir | path join "tmp")
          let run_dir = ($repo_dir | path join "run")
          let signal_socket_path = ($run_dir | path join "signal-cli.sock")

          mkdir $tmp_dir
          $env.TMPDIR = $tmp_dir
          $env.JAVA_TOOL_OPTIONS = $"-Djava.io.tmpdir=($tmp_dir)"
          $env.UV_NO_MANAGED_PYTHON = "1"
          $env.UV_PYTHON = "${nixPython}"

          cd $repo_dir
          ^${pkgs.uv}/bin/uv run --frozen --python "${nixPython}" bot --config $config
        }
      '';

      runSignalDaemon = pkgs.writeScriptBin "signal-daemon-run" ''
        ${nuShellScript}

        def main [
          # Signal account number for signal-cli (or use environment variable $VANL_BOT_SIGNAL_ACCOUNT)
          --signal-account: string
          # Directory to hold signal-cli's runtime state: tmp/ (its own JVM tmpdir) and
          # run/signal-cli.sock (the JSON-RPC socket the bot connects to - must match the bot's
          # own `signal_daemon_socket_path` config, see bot/src/bot/config.py)
          --signal-daemon-dir: string = "."
          # 0 = non-verbose, 1 = verbose, 2 = extra verbose
          --verbose-level: int = 0
          # optional signal-cli log file path
          --log-file: string = ""
        ] {
          let signal_account = ($signal_account | default ($env | get -o VANL_BOT_SIGNAL_ACCOUNT))
          required_flags [
            { name: "signal-account", value: $signal_account, env: "VANL_BOT_SIGNAL_ACCOUNT" }
          ]
          let signal_daemon_dir = ($signal_daemon_dir | path expand)

          let tmp_dir = ($signal_daemon_dir | path join "tmp")
          let run_dir = ($signal_daemon_dir | path join "run")
          let signal_socket_path = ($run_dir | path join "signal-cli.sock")

          mkdir $tmp_dir $run_dir
          if ($signal_socket_path | path exists) {
            rm $signal_socket_path
          }
          $env.TMPDIR = $tmp_dir
          $env.JAVA_TOOL_OPTIONS = $"-Djava.io.tmpdir=($tmp_dir)"

          let verbose_args = if $verbose_level == 2 {
            ["-vv"]
          } else if $verbose_level == 1 {
            ["-v"]
          } else if $verbose_level == 0 {
            []
          } else {
            print -e $"Invalid verbose-level value: ($verbose_level)"
            print -e "Expected 0, 1, or 2"
            exit 1
          }

          let log_file_args = if $log_file == "" { [] } else { ["--log-file" $log_file] }

          cd $signal_daemon_dir
          ^${pkgs.signal-cli}/bin/signal-cli ...$verbose_args ...$log_file_args -u $signal_account daemon --socket $signal_socket_path --receive-mode on-connection
        }
      '';

      # Two stages: fetch (FOD, network) then assemble (normal derivation, offline). Two things
      # were tried and empirically ruled out before landing here:
      #
      # 1. A single "uv sync straight into $out" FOD. Doesn't work: python venvs bake $out's own
      #    absolute path into themselves (console-script shebangs, pyvenv.cfg, which then feeds
      #    into dist-info/RECORD's file hashes too), so the venv's content depends on $out - but
      #    $out is *derived from* the declared outputHash for a FOD, and the whole point of a FOD
      #    is verifying declared-hash against a content-hash that's supposed to be independent of
      #    $out. Confirmed empirically: the standard "build with a fake hash, plug in the real
      #    one" bootstrap never converges this way - every new declared hash produces a new $out,
      #    which produces new self-referential content, which produces yet another different real
      #    hash, indefinitely.
      # 2. Hashing uv's own cache directory (`UV_CACHE_DIR=$out` from a throwaway `uv sync`).
      #    Doesn't work either, for an unrelated reason: uv's cache uses randomly-named
      #    extraction directories (`archive-v0/<random>`) that differ on every run regardless of
      #    self-reference - confirmed empirically by diffing two independently-populated cache
      #    dirs for identical input.
      #
      # What actually works: `uv pip install --target <dir>` (the pip-compatible flat-install
      # mode) - confirmed byte-for-byte reproducible across independent runs. Its console-script
      # shebangs point at the interpreter passed via --python (a stable nix store path) - *but
      # only* when run from a directory with no pyproject.toml in scope; with one present, uv's
      # shebang generation ignores --python and defaults to `<project_root>/.venv/bin/python`
      # regardless, matching wherever `uv sync` would have put a venv, confirmed empirically.
      # So: run `uv export --no-emit-project` (dependencies only, no local `file://` reference
      # back to the source, which would itself force project-mode) from the project root to
      # produce a plain requirements.txt, then run the actual `uv pip install --target` from an
      # unrelated empty directory.
      botDeps = pkgs.stdenv.mkDerivation {
        pname = "bot-deps";
        version = "0";
        src = self;
        nativeBuildInputs = [pkgs.uv pkgs.python312];
        outputHashMode = "recursive";
        outputHashAlgo = "sha256";
        # Depends on which nixpkgs revision built it, not just bot/uv.lock - see web/flake.nix's
        # webDeps comment for why. Recompute via `nix run
        # /home/lobo/projects/vanl/server#update-bot-venv-hash`, not `nix run
        # .#update-bot-venv-hash` from within bot/ (that checks against the wrong nixpkgs
        # evaluation - bot/'s own standalone-locked one, not server's followed one).
        outputHash = "sha256-xsa0QvtAZa0m9m/v9JhK76cnyTqgOEwJL/565yFDee4=";
        buildPhase = ''
          export HOME=$TMPDIR
          export UV_NO_MANAGED_PYTHON=1
          export UV_CACHE_DIR=$TMPDIR/uv-cache
          # Nix sandboxes (even FODs) don't provide CA certs by default - uv's HTTPS requests
          # to PyPI need these explicitly, same fix fetchNpmDeps/buildNpmPackage use internally.
          export SSL_CERT_FILE="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
          export GIT_SSL_CAINFO="$SSL_CERT_FILE"
          uv export --frozen --no-dev --no-emit-project --format requirements-txt --no-hashes -o $TMPDIR/requirements.txt
          mkdir -p $TMPDIR/neutral
          (cd $TMPDIR/neutral && uv pip install --target $out -r $TMPDIR/requirements.txt --python "${nixPython}")
          # FODs may not contain references to other store paths, but uv bakes ${nixPython}'s
          # literal store path into every generated console-script shebang, for every
          # third-party package that happens to have one - none of which bot actually needs
          # (it imports these as libraries, never invokes their CLIs; its own entry point is
          # hand-rolled separately in botVenv below). Confirmed empirically: without this,
          # `nix build` fails with "fixed-output derivations must not reference store paths".
          rm -rf $out/bin
        '';
        dontInstall = true;
      };

      # Normal (non-fixed-output) derivation: copies botDeps' pre-fetched third-party packages
      # plus bot's own (pure-Python, no build step needed) source into $out, and writes a small
      # hand-rolled console-script wrapper - entirely offline, no uv/pip invocation needed here
      # at all. See the comment on botDeps above for why this has to be a separate, non-FOD
      # stage in the first place.
      botVenv = pkgs.stdenv.mkDerivation {
        pname = "bot";
        version = "0";
        src = self;
        dontBuild = true;
        installPhase = ''
          mkdir -p $out/bin
          cp -r ${botDeps}/. $out/
          cp -r src/bot $out/bot
          find $out -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
          printf '%s\n' \
            '#!${nixPython}' \
            'import sys' \
            'sys.path.insert(0, "'"$out"'")' \
            'from bot.__main__ import main' \
            'if __name__ == "__main__":' \
            '    main()' \
            > $out/bin/bot
          chmod +x $out/bin/bot
        '';
      };

      # Same botDeps derivation with a deliberately-wrong hash, so `nix build` fails with Nix's
      # own "got: sha256-..." message revealing the real one - see updateBotVenvHash below.
      botDepsHashCheck = botDeps.overrideAttrs (_: {outputHash = pkgs.lib.fakeHash;});

      updateBotVenvHash = pkgs.writeShellScriptBin "update-bot-venv-hash" ''
        set -euo pipefail
        echo "Computing bot-deps' real dependency hash (this will intentionally fail once)..." >&2
        if out=$(nix build --no-link --print-out-paths '.#bot-deps-hash-check' 2>&1); then
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
        echo "New outputHash for bot-deps (paste into bot/flake.nix): $real_hash"
      '';

      checkProject = pkgs.writeScriptBin "check-project" ''
        #!/usr/bin/env bash
        set -euo pipefail
        export UV_NO_MANAGED_PYTHON=1
        export UV_PYTHON="${nixPython}"
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" pyrefly check .
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" ruff check --fix
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" pytest
      '';

      installPrecommitHooks = pkgs.writeScriptBin "install-precommit-hooks" ''
        #!/usr/bin/env bash
        ${self.checks.${system}.pre-commit-check.shellHook}
      '';

      link = pkgs.writeScriptBin "link" ''
        ${nuShellScript}
        def main [--machine-name: string] {
          required_flags [{ name: "machine-name", value: $machine_name }]
          let link_name = $"Vegan Activists NL bot (($machine_name))"
          ${pkgs.signal-cli}/bin/signal-cli link -n $link_name
        }
      '';

      generateSignupKey = pkgs.writeScriptBin "generate-signup-key" ''
        #!/usr/bin/env bash
        set -euo pipefail
        export UV_NO_MANAGED_PYTHON=1
        export UV_PYTHON="${nixPython}"
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" python -c '
        from bot.signup_token import generate_keypair
        seed_b64, public_b64 = generate_keypair()
        print(f"VANL_SIGNUP_PRIVATE_KEY (bot secret, env var)  = {seed_b64}")
        print(f"signup_public_key (website config, not secret) = {public_b64}")
        '
      '';

      # Dev-time convenience (`nix run .#dev`), mirroring web/flake.nix's `dev` app: starts
      # signal-daemon-run as a background job, then bot-run in the foreground against
      # configs/dev.toml, and kills the daemon job once bot-run exits - including on Ctrl+C,
      # which lands in the catch block same as web/flake.nix's devRun.
      #
      # Checked here up front (not just left to signal-daemon-run's/bot-run's own checks) so a
      # missing var is reported before either process starts, rather than after the daemon's
      # already running with nothing left to clean it up on the bot's subsequent failure. Values
      # for local development live in bot/.envrc (gitignored, direnv-sourced).
      runDev = pkgs.writeScriptBin "bot-dev" ''
        ${nuShellScript}

        def main [
          --repo-dir: string = "."
          --config: string = "configs/dev.toml"
        ] {
          let repo_dir = ($repo_dir | path expand)

          let missing_env = (
            ["VANL_BOT_SIGNAL_ACCOUNT" "VANL_SIGNUP_PRIVATE_KEY" "VANL_BOT_API_SHARED_SECRET"]
            | where {|name| ($env | get -o $name | default "") == ""}
          )
          if ($missing_env | length) > 0 {
            print -e "Error: Missing required environment variable(s) (see bot/.envrc):"
            for name in $missing_env { print -e $"  - ($name)" }
            exit 1
          }

          let daemon_job = (job spawn { ^${runSignalDaemon}/bin/signal-daemon-run --signal-daemon-dir $repo_dir })
          try {
            ^${runBot}/bin/bot-run --repo-dir $repo_dir --config $config
          } catch {
            # Ctrl+C lands here too - fall through to stop the daemon below.
          }
          job kill $daemon_job
        }
      '';
    in {
      packages = {
        default = pkgs.signal-cli;
        signal-cli = pkgs.signal-cli;
        install-precommit-hooks = installPrecommitHooks;
        check-project = checkProject;
        bot-run = runBot;
        signal-daemon-run = runSignalDaemon;
        bot-dev = runDev;
        link = link;
        bot-deps = botDeps;
        bot-deps-hash-check = botDepsHashCheck;
        bot = botVenv;
      };

      devShells.default = pkgs.mkShell {
        packages = runtimePkgs ++ [self.packages.${system}.install-precommit-hooks];
        shellHook = ''
          export UV_NO_MANAGED_PYTHON=1
          export UV_PYTHON="${nixPython}"
          uv sync --dev --frozen --python "${nixPython}"
          source .venv/bin/activate
        '';
      };

      checks = {
        pre-commit-check = pre-commit-hooks.lib.${system}.run {
          src = ./.;
          hooks = {
            check-project = {
              name = "check-project";
              types = ["python"];
              enable = true;
              entry = "${self.packages.${system}.check-project}/bin/check-project";
            };
          };
        };
      };

      apps = {
        link = {
          type = "app";
          program = "${link}/bin/link";
        };
        bot = {
          type = "app";
          program = "${runBot}/bin/bot-run";
        };
        signal-daemon = {
          type = "app";
          program = "${runSignalDaemon}/bin/signal-daemon-run";
        };
        dev = {
          type = "app";
          program = "${runDev}/bin/bot-dev";
        };
        install-precommit-hooks = {
          type = "app";
          program = "${self.packages.${system}.install-precommit-hooks}/bin/install-precommit-hooks";
        };
        generate-signup-key = {
          type = "app";
          program = "${generateSignupKey}/bin/generate-signup-key";
        };
        update-bot-venv-hash = {
          type = "app";
          program = "${updateBotVenvHash}/bin/update-bot-venv-hash";
        };
      };
    }))
    // {
      nixosModules.default = {
        config,
        lib,
        pkgs,
        ...
      }: let
        cfg = config.services.vanl-bot;
        botSelf = self;
      in {
        options.services.vanl-bot = {
          enable = lib.mkEnableOption "the Vegan Activists NL Signal bot and its signal-cli daemon";

          configFile = lib.mkOption {
            type = lib.types.path;
            description = "Path to the bot's TOML config file (e.g. the bot flake input's own configs/prod.toml).";
          };

          environmentFile = lib.mkOption {
            type = lib.types.path;
            description = ''
              EnvironmentFile= providing VANL_SIGNUP_PRIVATE_KEY,
              VANL_BOT_API_SHARED_SECRET, and VANL_BOT_SIGNAL_ACCOUNT (the
              Signal account phone number, e.g. +316...). Never committed;
              admin-managed, e.g. /etc/vanl/bot.env.
            '';
          };

          user = lib.mkOption {
            type = lib.types.str;
            default = "vanl-bot";
          };
          group = lib.mkOption {
            type = lib.types.str;
            default = "vanl-bot";
          };
        };

        config = lib.mkIf cfg.enable {
          users.groups.${cfg.group} = {};
          users.users.${cfg.user} = {
            isSystemUser = true;
            group = cfg.group;
            # Without this, isSystemUser defaults the passwd entry's home to /var/empty - a
            # deliberately unwritable directory. signal-cli's JVM resolves user.home via
            # getpwuid() (confirmed empirically: it ignores the $HOME env var entirely, so even
            # signal-daemon.service's own Environment = "HOME=..." below has no effect on it),
            # so without a real passwd-level home it fails with "/var/empty/.local: Operation
            # not permitted" trying to create its data directory.
            home = "/var/lib/${cfg.user}";
          };

          # vanl-bot-link: exposes bot's signal-cli device-linking helper on the host's PATH, no
          # flake checkout or store path to know or type - `sudo -u vanl-bot env
          # HOME=/var/lib/vanl-bot vanl-bot-link --machine-name <NAME>`. Must run as cfg.user
          # since that's the account bot.service/signal-daemon.service run as, and Signal's
          # linked-device state is tied to whichever $HOME did the linking.
          environment.systemPackages = [
            (pkgs.writeShellApplication {
              name = "vanl-bot-link";
              text = ''exec ${botSelf.packages.${pkgs.system}.link}/bin/link "$@"'';
            })
          ];

          # bot.service and signal-daemon.service share this StateDirectory/WorkingDirectory
          # on purpose: bot connects to `run/signal-cli.sock`, resolved relative to CWD, so
          # both services need to agree on the same working directory. It also holds
          # signal-cli's own persistent registration state (~/.local/share/signal-cli, via the
          # explicit HOME override on signal-daemon.service below).
          systemd.services.bot = {
            description = "Vegan Activists NL Signal bot";
            after = ["network-online.target" "signal-daemon.service"];
            wants = ["network-online.target"];
            requires = ["signal-daemon.service"];
            wantedBy = ["multi-user.target"];
            restartTriggers = [botSelf.packages.${pkgs.system}.bot];
            serviceConfig = {
              Type = "simple";
              User = cfg.user;
              Group = cfg.group;
              WorkingDirectory = "/var/lib/${cfg.user}";
              StateDirectory = cfg.user;
              ExecStart = "${botSelf.packages.${pkgs.system}.bot}/bin/bot --config ${cfg.configFile}";
              EnvironmentFile = cfg.environmentFile;
              Restart = "always";
              RestartSec = 2;
              StandardOutput = "journal";
              StandardError = "journal";
            };
          };

          systemd.services.signal-daemon = {
            description = "signal-cli daemon (JSON-RPC over Unix socket)";
            after = ["network-online.target"];
            wants = ["network-online.target"];
            wantedBy = ["multi-user.target"];
            serviceConfig = {
              Type = "simple";
              User = cfg.user;
              Group = cfg.group;
              WorkingDirectory = "/var/lib/${cfg.user}";
              StateDirectory = cfg.user;
              # Decouples signal-cli's $HOME-based state resolution
              # (~/.local/share/signal-cli) from whatever the vanl-bot user account's own
              # configured home happens to be.
              Environment = "HOME=/var/lib/${cfg.user}";
              EnvironmentFile = cfg.environmentFile;
              ExecStart = "${botSelf.packages.${pkgs.system}.signal-daemon-run}/bin/signal-daemon-run --signal-daemon-dir /var/lib/${cfg.user}";
              Restart = "always";
              RestartSec = 2;
              StandardOutput = "journal";
              StandardError = "journal";
            };
          };
        };
      };
    };
}
