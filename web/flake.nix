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
    flake-utils.lib.eachDefaultSystem (system: let
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

      install = pkgs.writeScriptBin "web-install" ''
        ${nuShellScript}

        def render-unit [lines] {
          $lines | str join (char nl)
        }

        def main [
          # Repository root to install from
          --repo-dir: string = "."
          # Path to the TOML config file for the website
          --config: string
          # Install runtime units instead of persistent units (for testing)
          --runtime
        ] {
          required_flags [
            { name: "config", value: $config }
          ]

          # Expand these paths, as systemd does not handle relative paths
          let repo_dir = ($repo_dir | path expand)
          let config = ($config | path expand)

          let web_user = (($env | get -i SUDO_USER) | default $env.USER)

          let web_service = (render-unit [
            "[Unit]"
            "Description=Vegan Activists NL website"
            "After=network-online.target"
            "Wants=network-online.target"
            ""
            "[Service]"
            "Type=simple"
            $"User=($web_user)"
            $"WorkingDirectory=($repo_dir)"
            "Environment=PORT=3000"
            "Environment=HOST=0.0.0.0"
            $"ExecStart=${runWeb}/bin/web-run --repo-dir ($repo_dir) --config ($config)"
            ""
            "Restart=always"
            "RestartSec=2"
            "StandardOutput=journal"
            "StandardError=journal"
            ""
            "[Install]"
            "WantedBy=multi-user.target"
          ])

          let tmp_dir = (mktemp -d | str trim)
          mkdir $tmp_dir
          $web_service | save -f ($tmp_dir | path join "vanl-web.service")

          let systemd_unit_dir = if $runtime {
            "/run/systemd/system"
          } else {
            "/etc/systemd/system"
          }
          sudo install -d $systemd_unit_dir
          sudo install -m 0644 ($tmp_dir | path join "vanl-web.service") ($systemd_unit_dir | path join "vanl-web.service")

          sudo systemctl daemon-reload
          let runtime = if $runtime { ["--runtime"] } else { [] }
          sudo systemctl ...$runtime enable --now vanl-web.service

          print "Installed and started:"
          print " - vanl-web.service"
          print $" - user: ($web_user)"
          print $" - unit dir: ($systemd_unit_dir)"
          if $systemd_unit_dir == "/run/systemd/system" {
            print " - note: /etc/systemd/system is not writable, so the unit was installed as a runtime unit"
          }
        }
      '';

      uninstall = pkgs.writeScriptBin "web-uninstall" ''
        ${nuShellScript}

        def main [] {
          let unit_dirs = ["/etc/systemd/system" "/run/systemd/system"]
          let unit = "vanl-web.service"

          let result = (sudo systemctl disable --now $unit | complete)
          if $result.exit_code != 0 {
            let stderr = ($result.stderr | str trim)
            if $stderr != "" {
              print -e $stderr
            }
          }

          for dir in $unit_dirs {
            let unit_path = ($dir | path join $unit)
            if ($unit_path | path exists) {
              sudo rm $unit_path
            }
          }

          sudo systemctl daemon-reload
          print "Uninstalled: vanl-web.service"
        }
      '';
    in {
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
        install = {
          type = "app";
          program = "${install}/bin/web-install";
        };
        uninstall = {
          type = "app";
          program = "${uninstall}/bin/web-uninstall";
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
    });
}
