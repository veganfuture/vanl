# Installing a server with NixOs anywhere:

Make sure to run with `--generate-hardware-config` if the hardware has changed!

```sh
nix run github:nix-community/nixos-anywhere -- --generate-hardware-config nixos-generate-config ./hardware-configuration.nix --flake .#vanl-hostkey1 --target-host root@$SERVER_IP
```


# Switching NixOs

```sh
nixos-rebuild switch --flake .#vanl-hostkey --target-host lobo@$SERVER_IP  --sudo
```
