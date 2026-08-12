{
  description = "Vegan Activists NL — website & calendar";

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

      runtimePkgs = with pkgs; [
        bun
        nodejs_22
        nushell
        git
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

          ^${pkgs.bun}/bin/bun run start
        }
      '';

      checkProject = pkgs.writeScriptBin "check-project" ''
        #!/usr/bin/env bash
        set -euo pipefail
        # vitest spawns worker processes that need `node` on PATH — without it
        # some deps resolve through Bun's own (differently-conditioned) loader
        # instead of Vite's, causing flaky module-resolution failures.
        export PATH="${pkgs.nodejs_22}/bin:$PATH"
        ${pkgs.bun}/bin/bun install --frozen-lockfile
        ${pkgs.bun}/bin/bun run format:check
        ${pkgs.bun}/bin/bun run lint
        ${pkgs.bun}/bin/bun run typecheck
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

          let web_user = (($env | get --optional SUDO_USER) | default $env.USER)

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
      packages = {
        check-project = checkProject;
      };

      devShells.default = pkgs.mkShell {
        packages = runtimePkgs;
        shellHook = ''
          echo "vanl website dev shell — bun $(${pkgs.bun}/bin/bun --version), node $(${pkgs.nodejs_22}/bin/node --version)"
        '';
      };

      apps = {
        web = {
          type = "app";
          program = "${runWeb}/bin/web-run";
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
      };
    });
}
