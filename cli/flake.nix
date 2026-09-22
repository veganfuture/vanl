{
  description = "Unified ops CLI for the Vegan Activists NL server (vanl web/bot/db ...)";

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
      nixPython = "${pkgs.python312}/bin/python";

      # No third-party runtime dependencies (stdlib argparse/subprocess/os
      # only - see src/vanl_cli), so unlike bot/flake.nix's botDeps/botVenv
      # split there is nothing to fetch from PyPI. Builds straight from
      # source, offline, in a single ordinary (non-fixed-output) derivation -
      # same hand-rolled console-script wrapper shape as botVenv, minus the
      # FOD dependency-fetch stage in front of it.
      cliPkg = pkgs.stdenv.mkDerivation {
        pname = "vanl-cli";
        version = "0";
        src = self;
        dontBuild = true;
        installPhase = ''
          mkdir -p $out/lib $out/bin
          cp -r src/vanl_cli $out/lib/vanl_cli
          find $out -name '__pycache__' -type d -exec rm -rf {} + 2>/dev/null || true
          printf '%s\n' \
            '#!${nixPython}' \
            'import sys' \
            'sys.path.insert(0, "'"$out"'/lib")' \
            'from vanl_cli.__main__ import main' \
            'if __name__ == "__main__":' \
            '    sys.exit(main())' \
            > $out/bin/vanl
          chmod +x $out/bin/vanl
        '';
      };

      checkProject = pkgs.writeScriptBin "check-project" ''
        #!/usr/bin/env bash
        set -euo pipefail
        export UV_NO_MANAGED_PYTHON=1
        export UV_PYTHON="${nixPython}"
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" pyrefly check .
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" ruff check --fix
        ${pkgs.uv}/bin/uv run --dev --frozen --python "${nixPython}" pytest
      '';
    in {
      packages = {
        default = cliPkg;
        vanl-cli = cliPkg;
        check-project = checkProject;
      };

      devShells.default = pkgs.mkShell {
        packages = [pkgs.uv pkgs.python312 checkProject];
        shellHook = ''
          export UV_NO_MANAGED_PYTHON=1
          export UV_PYTHON="${nixPython}"
          uv sync --dev --frozen --python "${nixPython}"
          source .venv/bin/activate
        '';
      };

      apps = {
        vanl = {
          type = "app";
          program = "${cliPkg}/bin/vanl";
        };
        check-project = {
          type = "app";
          program = "${checkProject}/bin/check-project";
        };
      };
    }))
    // {
      # No `services.vanl-cli.enable` option - this is a stateless CLI, not a
      # service, so there's no meaningful "disabled" state on a host that
      # already imports this module. Depends on web's nixosModules.default
      # already being imported into the same NixOS config (reads
      # config.services.vanl-web.environmentFile directly) - true for every
      # host that imports this module today (server/flake.nix imports both).
      nixosModules.default = {
        config,
        pkgs,
        ...
      }: let
        cliSelf = self;
      in {
        environment.systemPackages = [
          (pkgs.writeShellApplication {
            name = "vanl";
            runtimeEnv = {
              # Pinned store paths, not left to ambient PATH - same reasoning
              # web/flake.nix's devdb-repl already applies to psql.
              VANL_CLI_PSQL_BIN = "${pkgs.postgresql}/bin/psql";
              VANL_CLI_WEB_ENV_FILE = config.services.vanl-web.environmentFile;
            };
            text = ''exec ${cliSelf.packages.${pkgs.system}.vanl-cli}/bin/vanl "$@"'';
          })
        ];
      };
    };
}
