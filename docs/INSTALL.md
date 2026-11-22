# Install

## Requirements

- **Ubuntu 22.04, Ubuntu 24.04 or Debian 12**, x86_64 (PotreeConverter is a 64-bit Intel/AMD build). A virtual machine or an LXC container is fine.
- **2 GB RAM** or more. Conversion and thumbnails are the heavy parts; viewing costs the server almost nothing.
- **Disk space** for your projects: a converted project takes about as much space as its LAS files, or half with Brotli. Leave room for one upload plus its conversion on top.
- A machine that does **nothing else on port 80**. The installer replaces only Apache's untouched default page. It stops, and changes nothing, if Apache already serves another site (including one in `000-default.conf`) or another program uses the port; use `OPCV_HTTP_PORT` then (below).
- Internet access during installation (packages, Node.js, PotreeConverter, headless Chrome).

## Install

```bash
curl -fsSL https://raw.githubusercontent.com/matejkrajcovic111-ctrl/opcviewer/main/install.sh | sudo bash
```

Or download it first and read it, which is a good habit with any script run as root:

```bash
curl -fsSLO https://raw.githubusercontent.com/matejkrajcovic111-ctrl/opcviewer/main/install.sh
less install.sh
sudo bash install.sh
```

At the end it prints:

```
  Admin panel:    http://192.168.1.20:3300/
                  Open it and set the admin password with this setup code:
                  k7Q2-x9Pm-44Za
  Project pages:  http://192.168.1.20/<project>/
```

Open the admin panel, enter the setup code and choose a password. Done.

### Options

Set them in front of the command, e.g. `curl … | sudo OPCV_HTTP_PORT=8080 bash`:

| Variable | Default | |
|---|---|---|
| `OPCV_HTTP_PORT` | `80` | Port Apache serves the project pages on |
| `OPCV_ADMIN_PORT` | `3300` | Port of the admin panel (first install only; later change it in the settings file) |
| `OPCV_WWW` | `/var/www/opcviewer` | Folder of the project pages (one sub-folder per project) |
| `OPCV_HOME` | `/opt/opcviewer` | App, Node.js, PotreeConverter, data |
| `OPCV_BRANCH` | `main` | Branch to install |
| `OPCV_REPO` | this repository | Git URL (for your own fork) |

### What it installs

| Where | What | Owner |
|---|---|---|
| `/opt/opcviewer/app` | this repository | root |
| `/opt/opcviewer/node` | Node.js 24 (official build, checksum verified) | root |
| `/opt/opcviewer/potreeconverter` | PotreeConverter 2.1.2 (official build, checksum verified) | root |
| `/opt/opcviewer/.cache/puppeteer` | headless Chrome for thumbnails | root |
| `/opt/opcviewer/data` | password hash, sessions, branding, statistics, thumbnails | opcviewer |
| `/opt/opcviewer/app/uploads`, `…/trash` | uploads in progress, deleted projects | opcviewer |
| `/var/www/opcviewer` | project pages, `potree_libs/` (Potree with the opcviewer scripts), `.htaccess`, landing page | opcviewer |
| `/etc/opcviewer/opcviewer.env` | settings | root |
| `/etc/systemd/system/opcviewer.service` | the service (runs as user `opcviewer`) | root |
| `/etc/apache2/sites-available/opcviewer.conf` | the Apache site (replaces Apache's default site on port 80) | root |

Packages from apt: `apache2 git curl ca-certificates unzip xz-utils python3 libtbb12 acl`, plus the libraries headless Chrome needs. The `opcviewer` user gets read access to Apache's access logs (for view counts) through an ACL, nothing more.

## Settings

`/etc/opcviewer/opcviewer.env`; after a change run `sudo systemctl restart opcviewer`.

| Setting | |
|---|---|
| `OPCV_PORT` | Admin panel port |
| `OPCV_HOST` | `0.0.0.0` = reachable from your network, `127.0.0.1` = this machine only (e.g. behind a reverse proxy or SSH tunnel) |
| `OPCV_PUBLIC_URL` | The address clients use, e.g. `https://pointclouds.example.com`. Used by **Copy link**. Empty = the address you opened the admin panel at |
| `OPCV_WWW_ROOT` | Folder of the project pages |
| `OPCV_DATA_DIR` | Data folder |
| `OPCV_CONVERTER_DIR` | PotreeConverter folder |
| `OPCV_ACCESS_LOG` | Apache access log read for statistics |
| `OPCV_LOCAL_URL` | Where the server reaches its own project pages (thumbnails), `http://127.0.0.1:<http port>` |

## Going online

The project pages are static files on port 80; the admin panel is a separate app on port 3300. **Publish only the project pages.** The admin panel has a password, but it can upload files and run conversions and was not built to face the whole internet. Reach it from your own network, over a VPN or through an SSH tunnel (`ssh -L 3300:localhost:3300 you@server`, then open `http://localhost:3300/`).

Whichever way you choose, set `OPCV_PUBLIC_URL` to the address clients will use, so **Copy link** gives them the right one.

### Local network only

Nothing to do: `http://<server-ip>/<project>/` works for everyone on the network. Fine for an office, or for a server that a partner reaches over a VPN.

### Cloudflare Tunnel (no open ports, free)

Good when the server is at home or in an office without a public IP. Requires a domain on Cloudflare.

1. In the Cloudflare dashboard: **Zero Trust → Networks → Tunnels → Create a tunnel**, type *Cloudflared*, give it a name.
2. Install the connector it shows on the opcviewer server (or on another machine in the same network).
3. **Public hostname:** e.g. `pointclouds.example.com` → service `HTTP` → `localhost:80` (or `<server-ip>:80` if the connector runs elsewhere). Do **not** add a hostname for port 3300.
4. `OPCV_PUBLIC_URL=https://pointclouds.example.com`, restart.

Notes from production use:
- Cloudflare's free plan does not cache files over 512 MB, and most `octree.bin` files are larger. The data therefore always comes from your server, and your upload speed decides how fast big projects load. That's fine; just don't expect a CDN.
- Turn off caching for this hostname (Cache Rule *Bypass cache* for `pointclouds.example.com`). The `.htaccess` already sends `no-cache` for pages and metadata, and partially cached point data only causes confusion.
- Requests through a tunnel are sometimes dropped mid-way. The patched Potree loader opcviewer installs recovers from that; an unpatched Potree would stop loading after four such drops.

### Your own reverse proxy with HTTPS

When the server has a public IP or sits behind a proxy you already run (Caddy, nginx, Nginx Proxy Manager, Traefik). Point a hostname at Apache on port 80. Caddy, for example:

```
pointclouds.example.com {
    reverse_proxy 127.0.0.1:80
}
```

nginx: pass `Range` through (it does by default) and don't buffer the large files:

```nginx
location / {
    proxy_pass http://127.0.0.1:80;
    proxy_buffering off;
    proxy_set_header Host $host;
}
```

If the proxy runs on the same machine, set `OPCV_HTTP_PORT=8080` at install, so Apache doesn't compete with it for port 80, and proxy to `127.0.0.1:8080`.

### Tailscale

For sharing with a few people you can add to your tailnet, or publicly with **Tailscale Funnel**: `sudo tailscale funnel 80` publishes port 80 at `https://<machine>.<tailnet>.ts.net/`. Funnel has bandwidth limits; for large projects and many clients, a tunnel or a proxy is a better fit.

### Opening port 80 on your router

Possible, but then visitors connect to your server unencrypted (no HTTPS). Prefer one of the options above.

## Updating

Run the install command again. It fetches the new version, reinstalls dependencies, updates the viewer scripts in `potree_libs` and restarts the service. Projects, the password, branding, statistics and `/etc/opcviewer/opcviewer.env` are kept, and existing project pages are not rewritten.

## Backups

Everything that matters is in two places:

- `/var/www/opcviewer`: the projects (large)
- `/opt/opcviewer/data`: password, branding, statistics, thumbnails (small)

The rest can be recreated by running the installer again.

## Logs and troubleshooting

```bash
systemctl status opcviewer
journalctl -u opcviewer -n 100        # admin panel, conversions, thumbnails
tail -f /var/log/apache2/access.log   # page and data requests
```

| Problem | Look at |
|---|---|
| Admin panel doesn't open | `systemctl status opcviewer`; firewall (`ufw allow 3300` on your network) |
| Project page blank or 404 | Does `/var/www/opcviewer/<project>/index.html` exist? `apache2ctl configtest` |
| Conversion fails | The job log in **Conversions**; free disk space (`df -h`) |
| No thumbnails | `journalctl -u opcviewer | grep -i thumbnail` |
| Viewer stops loading new detail | In the browser console: `Potree.numNodesLoading`. Stuck at 8 means a new kind of failed request; anything lower means it is still working |

## Uninstall

```bash
sudo systemctl disable --now opcviewer
sudo rm /etc/systemd/system/opcviewer.service && sudo systemctl daemon-reload
sudo a2dissite opcviewer && sudo a2ensite 000-default && sudo systemctl reload apache2
sudo rm -r /etc/opcviewer /opt/opcviewer      # app and data
sudo rm -r /var/www/opcviewer                  # your projects: back them up first
sudo userdel opcviewer
```
