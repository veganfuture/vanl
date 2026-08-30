{
  description = "Vegan Activists NL — website";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
  }:
    (flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};

      prodPkgs = with pkgs; [bun postgresql];

      # Node is here purely because
      # vitest spawns worker processes that need `node` on PATH - without
      # it, some deps resolve through bun's own (differently-conditioned)
      # loader instead of Vite's, breaking tests.
      checkPkgs = prodPkgs ++ [pkgs.nodejs_22];

      devShellPkgs = checkPkgs ++ [pkgs.nushell];

      # sharp (image processing, M6) ships prebuilt native bindings that
      # dlopen libstdc++.so.6 by soname - NixOS doesn't put it on a standard
      # linker path, so every place bun actually runs app code needs this on
      # LD_LIBRARY_PATH or sharp fails to load at runtime.
      nativeLibPath = "${pkgs.stdenv.cc.cc.lib}/lib";

      devDbPort = 54329;

      # Fixed-output derivation: `bun install` needs network access to fetch dependencies from
      # the npm registry, which Nix only allows inside a FOD (purity comes from verifying $out's
      # hash afterward, not from sandboxing - the same mechanism nixpkgs' own fetchNpmDeps uses
      # internally). See bot/flake.nix's botDeps for the two real gotchas discovered building
      # the equivalent thing for uv (both checked and ruled out here, see below).
      webDeps = pkgs.stdenv.mkDerivation {
        pname = "web-deps";
        version = "0";
        src = self;
        # nodejs_22 needed for patchShebangs below to have something to rewrite
        # `#!/usr/bin/env node` shebangs (e.g. .bin/vite) to - Nix's sandbox has no
        # /usr/bin/env at all, so those scripts are otherwise unusable as-is.
        nativeBuildInputs = [pkgs.bun pkgs.nodejs_22];
        outputHashMode = "recursive";
        outputHashAlgo = "sha256";
        # At least one package's postinstall step embeds an absolute store path (confirmed
        # empirically: "fixed-output derivations must not reference store paths" - the reference
        # wasn't in any grep-able text file in the kept build directory, so likely a binary/
        # native artifact rather than a shebang; unlike bot/flake.nix's equivalent problem,
        # stripping node_modules/.bin here isn't an option anyway, since `bun run build` needs
        # its own .bin/vite). unsafeDiscardReferences is the standard nixpkgs escape hatch for
        # exactly this - used internally by fetchNpmDeps for the same reason - it skips Nix's
        # reference scan for this output rather than requiring every incidental embedded path to
        # be hunted down and stripped by hand.
        __structuredAttrs = true;
        unsafeDiscardReferences.out = true;
        # This bakes in patchShebangs-rewritten store paths (e.g. .bin/vite's #!.../node), so its
        # real hash depends on which nixpkgs revision built it - not just on bun.lock. web/'s own
        # nixpkgs input follows server/flake.nix's when built as part of the composed NixOS
        # deployment (the only context that actually matters), which differs from web/flake.nix's
        # own standalone-locked nixpkgs. So: recompute via `nix run
        # /home/lobo/projects/vanl/server#update-web-deps-hash`, not `nix run .#update-web-deps-hash`
        # from within web/ - the latter checks against the wrong nixpkgs evaluation.
        outputHash = "sha256-BZ0C/mDGiCYBZWKLkTBCGTx+zPrZDtEDEeyyySbERg4=";
        buildPhase = ''
          export HOME=$TMPDIR
          # Nix sandboxes (even FODs) don't provide CA certs by default - bun's HTTPS requests
          # to the npm registry need these explicitly, same fix fetchNpmDeps uses internally.
          export NODE_EXTRA_CA_CERTS="${pkgs.cacert}/etc/ssl/certs/ca-bundle.crt"
          bun install --frozen-lockfile
          # Rewrites `#!/usr/bin/env node` (and similar) shebangs to real store paths -
          # patchShebangs is a standard stdenv hook, always available in a mkDerivation build.
          # Must happen here, not in webBuild: this output becomes read-only once built.
          patchShebangs node_modules
        '';
        installPhase = "mkdir -p $out && cp -r node_modules $out/";
      };

      webDepsHashCheck = webDeps.overrideAttrs (_: {outputHash = pkgs.lib.fakeHash;});

      updateWebDepsHash = pkgs.writeShellScriptBin "update-web-deps-hash" ''
        set -euo pipefail
        echo "Computing web-deps' real dependency hash (this will intentionally fail once)..." >&2
        if out=$(nix build --no-link --print-out-paths '.#web-deps-hash-check' 2>&1); then
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
        echo "New outputHash for web-deps (paste into web/flake.nix): $real_hash"
      '';

      # Normal (non-fixed-output) derivation: copies in webDeps' pre-fetched node_modules and
      # runs `bun run build`, entirely offline (no network needed - all deps are already
      # present). Confirmed by inspecting an actual local build that `.output/` is fully
      # self-contained: Nitro's build already copies even sharp's platform-specific native
      # `.node` bindings into `.output/server/node_modules/`, so nothing besides `.output/` (and
      # `package.json`, for `bun run start` to resolve its own "start" script - see below) needs
      # to travel any further.
      webBuild = pkgs.stdenv.mkDerivation {
        pname = "web-build";
        version = "0";
        src = self;
        # nodejs_22 needed too, not just bun: bun's script runner honors vite's own
        # `#!/usr/bin/env node` shebang (established earlier - `bun run build` actually runs as
        # a `node .../vite build` process), confirmed here by the alternative failing with
        # "required file not found" otherwise.
        nativeBuildInputs = [pkgs.bun pkgs.nodejs_22];
        buildPhase = ''
          export HOME=$TMPDIR
          # A symlink to webDeps' (read-only) node_modules doesn't work: Nitro's build writes
          # scratch/cache files inside node_modules/.nitro/ during the build (confirmed
          # empirically: "Permission denied" trying to create that directory through a symlink
          # to a nix store path) - needs a real, writable copy instead.
          cp -r ${webDeps}/node_modules node_modules
          chmod -R u+w node_modules
          bun run build
        '';
        # package.json is copied alongside .output/, not just .output/ itself - web-run's
        # wrapper invokes `bun run start` (package.json's "start" script), which needs a
        # package.json present in the working directory to resolve at all, even though the
        # script it points at (.output/server/index.mjs) doesn't otherwise need anything else
        # from it.
        installPhase = "mkdir -p $out && cp -r .output package.json $out/";
      };

      # web-build's $out only contains .output/ (the built server), not the full source +
      # node_modules that scripts/migrate.ts needs - so migrations get their own small wrapper:
      # symlink webDeps' node_modules alongside the full source and run the script directly.
      # configs/prod.toml has database.host = "127.0.0.1", so this only makes sense run *on* the
      # VPS (not the admin's own machine) - server/configuration.nix exposes it via
      # environment.systemPackages as `vanl-web-migrate`.
      webMigrate = pkgs.writeShellScriptBin "web-migrate" ''
        set -euo pipefail
        workdir=$(mktemp -d)
        trap 'rm -rf "$workdir"' EXIT
        cp -r ${self}/. "$workdir/"
        chmod -R u+w "$workdir"
        ln -sfn ${webDeps}/node_modules "$workdir/node_modules"
        cd "$workdir"
        exec ${pkgs.bun}/bin/bun run scripts/migrate.ts "$@"
      '';

      nuShellScript = ''
        #!${pkgs.nushell}/bin/nu

        def required_flags [flags: list<record>] {
          mut msgs: list<string> = []
          for flag in $flags {
            if ($flag.value | is-empty) {
              let env_msg = if ($flag | get -i env) != null { $" or use environment variable $($flag.env)" } else { ""}
              $msgs = ($msgs | append $"Error: Missing required flag: --($flag.name)($env_msg)")
            }
          }
          if ($msgs | length) > 0 {
            print ($msgs | str join (char nl))
            exit 1
          }
        }
      '';

      # Runs the production server (`bun run start`, i.e. the built nitro output).
      runWeb = pkgs.writeScriptBin "web-run" ''
        ${nuShellScript}

        def main [
          --repo-dir: string = "."
          --config: string = ""
        ] {
          let repo_dir = ($repo_dir | path expand)
          cd $repo_dir

          if $config != "" {
            $env.VANL_CONFIG_PATH = ($config | path expand)
          }
          $env.LD_LIBRARY_PATH = $"${nativeLibPath}:($env.LD_LIBRARY_PATH? | default "")"
          # See prodPkgs' comment above for why this needs to be on PATH
          # (not just invoked once by store path below) - this makes the
          # whole thing a fully self-contained production runtime with no
          # dependency on `node` (or any ambient PATH) being present at all.
          $env.PATH = $"${pkgs.lib.makeBinPath prodPkgs}:($env.PATH? | default "")"

          ^${pkgs.bun}/bin/bun run start
        }
      '';

      devDbStart = pkgs.writeScriptBin "devdb-start" ''
        ${nuShellScript}

        def main [--repo-dir: string = "."] {
          let repo_dir = ($repo_dir | path expand)
          let devdb_dir = ($repo_dir | path join ".devdb")
          let data_dir = ($devdb_dir | path join "data")
          let socket_dir = ($devdb_dir | path join "run")
          let log_file = ($devdb_dir | path join "postgres.log")

          mkdir $socket_dir

          if not ($data_dir | path exists) {
            print "Initializing local dev Postgres data directory..."
            ^${pkgs.postgresql}/bin/initdb -D $data_dir -U vanl --auth=trust --no-instructions
          }

          let pid_file = ($data_dir | path join "postmaster.pid")
          if ($pid_file | path exists) {
            print "Dev Postgres already running."
          } else {
            ^${pkgs.postgresql}/bin/pg_ctl start -D $data_dir -l $log_file -o $"-p ${toString devDbPort} -k '($socket_dir)' -h 127.0.0.1"
            print $"Dev Postgres started on 127.0.0.1:${toString devDbPort}"
          }

          let result = (^${pkgs.postgresql}/bin/createdb -h 127.0.0.1 -p ${toString devDbPort} -U vanl vanl_dev | complete)
          if $result.exit_code == 0 {
            print "Created database vanl_dev"
          }
          # Separate from vanl_dev on purpose - see configs/test.toml's
          # comment: the test suite truncates tables in beforeEach, and it
          # used to do that against the same DB the interactive `bun run
          # dev` session uses, destroying real manually-created data more
          # than once. Same Postgres instance, different database.
          let test_result = (^${pkgs.postgresql}/bin/createdb -h 127.0.0.1 -p ${toString devDbPort} -U vanl vanl_test | complete)
          if $test_result.exit_code == 0 {
            print "Created database vanl_test"
          }
        }
      '';

      devDbStatus = pkgs.writeScriptBin "devdb-status" ''
        ${nuShellScript}

        def main [--repo-dir: string = "."] {
          let repo_dir = ($repo_dir | path expand)
          let data_dir = ($repo_dir | path join ".devdb" "data")
          let pid_file = ($data_dir | path join "postmaster.pid")

          if not ($pid_file | path exists) {
            print "Dev Postgres is not running."
            exit 1
          }

          let result = (^${pkgs.postgresql}/bin/pg_ctl status -D $data_dir | complete)
          if $result.exit_code == 0 {
            print $"Dev Postgres is running on 127.0.0.1:${toString devDbPort}."
          } else {
            print "Dev Postgres is not running (stale postmaster.pid?)."
            exit 1
          }
        }
      '';

      devDbRepl = pkgs.writeScriptBin "devdb-repl" ''
        ${nuShellScript}

        def main [--repo-dir: string = "."] {
          let repo_dir = ($repo_dir | path expand)
          let data_dir = ($repo_dir | path join ".devdb" "data")
          let pid_file = ($data_dir | path join "postmaster.pid")

          if not ($pid_file | path exists) {
            print -e "Dev Postgres is not running. Start it with: nix run .#devdb-start"
            exit 1
          }

          # Args must be a list spread with ...$args, not bare tokens after
          # `exec` — nushell's `exec` has its own -h/--help flag, so a literal
          # `-h` here gets parsed as exec's --help (swallowing every arg after
          # it) instead of being passed through to psql.
          let psql_args = ["-h" "127.0.0.1" "-p" "${toString devDbPort}" "-U" "vanl" "vanl_dev"]
          exec ${pkgs.postgresql}/bin/psql ...$psql_args
        }
      '';

      devDbStop = pkgs.writeScriptBin "devdb-stop" ''
        ${nuShellScript}

        def main [--repo-dir: string = "."] {
          let repo_dir = ($repo_dir | path expand)
          let data_dir = ($repo_dir | path join ".devdb" "data")
          if not ($data_dir | path exists) {
            print "No dev Postgres data directory found; nothing to stop."
            return
          }
          ^${pkgs.postgresql}/bin/pg_ctl stop -D $data_dir -m fast
        }
      '';

      # Start database, seed dev user and start webserver
      # Stops everything on Ctrl+c
      devRun = pkgs.writeScriptBin "web-dev" ''
        ${nuShellScript}

        def main [--repo-dir: string = "."] {
          let repo_dir = ($repo_dir | path expand)
          cd $repo_dir
          $env.PATH = $"${pkgs.lib.makeBinPath checkPkgs}:($env.PATH? | default "")"
          $env.LD_LIBRARY_PATH = $"${nativeLibPath}:($env.LD_LIBRARY_PATH? | default "")"

          ^${devDbStart}/bin/devdb-start --repo-dir $repo_dir
          if ($env.DEV_ACI? | default "") != "" {
            ^${pkgs.bun}/bin/bun run seed-dev-user
          }
          try {
            ^${pkgs.bun}/bin/bun run dev
          } catch {
            # Ctrl+C lands here too - fall through to stop the DB below.
          }
          ^${devDbStop}/bin/devdb-stop --repo-dir $repo_dir
        }
      '';

      checkProject = pkgs.writeScriptBin "check-project" ''
        #!/usr/bin/env bash
        set -euo pipefail
        # See checkPkgs' comment above for why each of these needs to be on
        # PATH (not just invoked once by store path below).
        export PATH="${pkgs.lib.makeBinPath checkPkgs}:$PATH"
        export LD_LIBRARY_PATH="${nativeLibPath}:''${LD_LIBRARY_PATH:-}"
        ${pkgs.bun}/bin/bun install --frozen-lockfile
        ${pkgs.bun}/bin/bun run format:check
        ${pkgs.bun}/bin/bun run lint
        ${pkgs.bun}/bin/bun run typecheck

        # Starts Postgres (creating both vanl_dev and vanl_test if needed)
        # but deliberately does NOT migrate/touch vanl_dev - the test suite
        # targets vanl_test on its own (vitest.config.ts's `test.env` +
        # `globalSetup`), so `nix run .#check` no longer touches the
        # interactive dev DB at all.
        ${devDbStart}/bin/devdb-start
        trap '${devDbStop}/bin/devdb-stop' EXIT
        ${pkgs.bun}/bin/bun run test

        ${pkgs.bun}/bin/bun run build
      '';

      # install/uninstall (imperative systemd-unit-writing apps) removed - replaced by
      # nixosModules.default below, composed declaratively via server/flake.nix.
    in {
      packages = {
        web-deps = webDeps;
        web-deps-hash-check = webDepsHashCheck;
        web-build = webBuild;
        web-run = runWeb;
        web-migrate = webMigrate;
      };

      devShells.default = pkgs.mkShell {
        packages = devShellPkgs;
        shellHook = ''
          export LD_LIBRARY_PATH="${nativeLibPath}:''${LD_LIBRARY_PATH:-}"
          echo "vanl website dev shell — bun $(${pkgs.bun}/bin/bun --version), node $(${pkgs.nodejs_22}/bin/node --version)"
        '';
      };

      apps = {
        web = {
          type = "app";
          program = "${runWeb}/bin/web-run";
        };
        dev = {
          type = "app";
          program = "${devRun}/bin/web-dev";
        };
        update-web-deps-hash = {
          type = "app";
          program = "${updateWebDepsHash}/bin/update-web-deps-hash";
        };
        check = {
          type = "app";
          program = "${checkProject}/bin/check-project";
        };
        devdb-start = {
          type = "app";
          program = "${devDbStart}/bin/devdb-start";
        };
        devdb-status = {
          type = "app";
          program = "${devDbStatus}/bin/devdb-status";
        };
        devdb-repl = {
          type = "app";
          program = "${devDbRepl}/bin/devdb-repl";
        };
        devdb-stop = {
          type = "app";
          program = "${devDbStop}/bin/devdb-stop";
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
        cfg = config.services.vanl-web;
        webSelf = self;
      in {
        options.services.vanl-web = {
          enable = lib.mkEnableOption "the Vegan Activists NL website (SolidStart/Bun, nitro build)";

          configFile = lib.mkOption {
            type = lib.types.path;
            description = "Path to the site's TOML config file (e.g. the web flake input's own configs/prod.toml).";
          };

          environmentFile = lib.mkOption {
            type = lib.types.path;
            description = ''
              EnvironmentFile= providing VANL_DATABASE_PASSWORD and
              VANL_BOT_API_SHARED_SECRET. Never committed; admin-managed,
              e.g. /etc/vanl/web.env.
            '';
          };

          user = lib.mkOption {
            type = lib.types.str;
            default = "vanl-web";
          };
          group = lib.mkOption {
            type = lib.types.str;
            default = "vanl-web";
          };
          port = lib.mkOption {
            type = lib.types.port;
            default = 3000;
          };
          host = lib.mkOption {
            type = lib.types.str;
            default = "127.0.0.1";
            description = "Bind address - loopback by default; Cloudflare Tunnel talks to it locally, it never needs to be reachable on any other interface directly.";
          };
        };

        config = lib.mkIf cfg.enable {
          users.groups.${cfg.group} = {};
          users.users.${cfg.user} = {
            isSystemUser = true;
            group = cfg.group;
            # Without this, isSystemUser defaults the passwd entry's home to /var/empty - a
            # deliberately unwritable directory. See bot/flake.nix's vanl-bot user for why this
            # matters even for tools that claim to respect $HOME (signal-cli's JVM doesn't).
            home = "/var/lib/${cfg.user}";
          };

          # vanl-web-migrate: exposes web's migration wrapper on the host's PATH, config baked
          # in - `sudo -u vanl-web env VANL_DATABASE_PASSWORD=<from web.env> vanl-web-migrate`,
          # no store path to know or type. cfg.configFile's database.host = "127.0.0.1" means
          # this only makes sense run on the host itself, not the admin's own machine.
          environment.systemPackages = [
            (pkgs.writeShellApplication {
              name = "vanl-web-migrate";
              runtimeEnv = {
                VANL_CONFIG_PATH = cfg.configFile;
              };
              text = ''exec ${webSelf.packages.${pkgs.system}.web-migrate}/bin/web-migrate "$@"'';
            })
          ];

          systemd.services.vanl-web = {
            description = "Vegan Activists NL website";
            after = ["network-online.target" "postgresql.service"];
            wants = ["network-online.target"];
            wantedBy = ["multi-user.target"];
            environment = {
              PORT = toString cfg.port;
              HOST = cfg.host;
            };
            restartTriggers = [webSelf.packages.${pkgs.system}.web-build];
            serviceConfig = {
              Type = "simple";
              User = cfg.user;
              Group = cfg.group;
              ExecStart = "${webSelf.packages.${pkgs.system}.web-run}/bin/web-run --repo-dir ${webSelf.packages.${pkgs.system}.web-build} --config ${cfg.configFile}";
              EnvironmentFile = cfg.environmentFile;
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
