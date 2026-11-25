#!/usr/bin/env bash
# opcviewer installer: sets up the admin panel, the point cloud converter and an Apache site
# for the project pages on a fresh Ubuntu 22.04 / 24.04 or Debian 12 server (x86_64).
#
#   curl -fsSL https://raw.githubusercontent.com/matejkrajcovic111-ctrl/opcviewer/main/install.sh | sudo bash
#
# Run it again to update: settings, projects and the admin password are kept.
# Options (environment variables, e.g. `sudo OPCV_ADMIN_PORT=8080 bash install.sh`):
#   OPCV_REPO        git repository to install from
#   OPCV_BRANCH      branch (main)
#   OPCV_HTTP_PORT   port Apache serves the project pages on (80)
#   OPCV_ADMIN_PORT  port of the admin panel (3300), used only when first installed
#   OPCV_WWW         folder for the project pages (/var/www/opcviewer)
#   OPCV_HOME        folder for the app, Node.js and the converter (/opt/opcviewer)
set -euo pipefail

OPCV_REPO=${OPCV_REPO:-https://github.com/matejkrajcovic111-ctrl/opcviewer.git}
OPCV_BRANCH=${OPCV_BRANCH:-main}
OPCV_HTTP_PORT=${OPCV_HTTP_PORT:-80}
OPCV_ADMIN_PORT=${OPCV_ADMIN_PORT:-3300}
OPCV_WWW=${OPCV_WWW:-/var/www/opcviewer}
OPCV_HOME=${OPCV_HOME:-/opt/opcviewer}

# Pinned downloads, checked against these SHA-256 sums.
NODE_VERSION=v24.22.3
NODE_SHA256=4f2b175a6d53a5c617a80dba2676238a0688cef28c6da4eba35c7d844e66fcfb
PC_VERSION=2.1.2
PC_URL=https://github.com/potree/PotreeConverter/releases/download/${PC_VERSION}/PotreeConverter_${PC_VERSION}_x64_linux.zip
PC_SHA256=f4040fc9fb30a42a60a7c86b6ee86706e8ad05100e1ae117b8fa13c717855c97

SVC_USER=opcviewer
APP=$OPCV_HOME/app
ENV_DIR=/etc/opcviewer
ENV_FILE=$ENV_DIR/opcviewer.env
UNIT=/etc/systemd/system/opcviewer.service
SVC_HOMEDIR=$OPCV_HOME/home   # the service user's own writable home (headless Chrome needs one)

say() { printf '\n\033[1m==> %s\033[0m\n' "$*"; }
die() { printf '\n\033[31mopcviewer install stopped: %s\033[0m\n' "$*" >&2; exit 1; }
# Ownership: the code, Node.js and the converter belong to root (read-only for the service).
# The service user owns only what it writes: the web folder, its data and upload folders.
# Root never writes into those folders itself; it does so as the service user, so a link
# planted there can't make root overwrite a system file.
as_user() { runuser -u "$SVC_USER" -- env HOME="$SVC_HOMEDIR" PATH="$OPCV_HOME/node/bin:/usr/bin:/bin" "$@"; }

# Never take over a web server or site that is already in use.
APACHE_ETC=${APACHE_ETC:-/etc/apache2}
DEFAULT_DOCROOT=${DEFAULT_DOCROOT:-/var/www/html}
port_listener() { # name of the program listening on TCP port $1, empty if none
  ss -Hltnp "sport = :$1" 2>/dev/null | grep -o 'users:(("[^"]*' | head -n1 | cut -d'"' -f2 || true
}
stock_default_site() { # 000-default.conf is still the untouched site of a fresh Apache install
  grep -Eq "^[[:space:]]*DocumentRoot[[:space:]]+$DEFAULT_DOCROOT/?[[:space:]]*$" "$APACHE_ETC/sites-enabled/000-default.conf" || return 1
  [ -z "$(find "$DEFAULT_DOCROOT" -mindepth 1 -maxdepth 1 ! -name index.html -print -quit 2>/dev/null)" ] || return 1
  [ ! -e "$DEFAULT_DOCROOT/index.html" ] || grep -q 'Apache2 .*Default Page' "$DEFAULT_DOCROOT/index.html"
}
check_apache_sites() { # on port 80 opcviewer replaces the default site, so there must be no other
  local others
  [ "$1" = 80 ] && [ -d "$APACHE_ETC/sites-enabled" ] || return 0
  others=$(find "$APACHE_ETC/sites-enabled" -mindepth 1 -maxdepth 1 ! -name 000-default.conf ! -name opcviewer.conf -printf '%f ')
  if [ -e "$APACHE_ETC/sites-enabled/000-default.conf" ] && ! stock_default_site; then
    others="${others}000-default.conf (changed from the stock page) "
  fi
  [ -z "$others" ] || die "Apache already serves other sites here ($others). Install on a clean machine, or set OPCV_HTTP_PORT to a free port."
}
check_port() {
  local who
  who=$(port_listener "$1")
  if [ -n "$who" ]; then
    # Apache itself is fine on 80 (sites checked above) or on opcviewer's own port (an update).
    if [ "$who" != apache2 ] || { [ "$1" != 80 ] && ! grep -qs "<VirtualHost \*:$1>" "$APACHE_ETC/sites-available/opcviewer.conf"; }; then
      die "port $1 is already used by $who. Set OPCV_HTTP_PORT to a free port."
    fi
  fi
  # A new Apache package always starts on port 80 first.
  if [ ! -d "$APACHE_ETC" ]; then
    who=$(port_listener 80)
    [ -z "$who" ] || die "port 80 is already used by $who, and Apache's package starts on port 80 when it is installed. Install Apache and move it to another port first, or free port 80."
  fi
}

admin_port() { # the admin panel's port: from the settings file if it exists (an update), else OPCV_ADMIN_PORT
  local p=""
  [ -f "$1" ] && p=$(sed -n 's/^OPCV_PORT=\([0-9][0-9]*\)[[:space:]]*$/\1/p' "$1" | tail -n1)
  printf '%s\n' "${p:-$OPCV_ADMIN_PORT}"
}

# Everything below runs only when the script is executed, not when it is sourced for tests
# (OPCV_SOURCE_ONLY=1). Being one function also means a download cut short runs nothing.
main() {
# ---------------------------------------------------------------- 1. preflight
[ "$(id -u)" -eq 0 ] || die "run it as root (sudo bash install.sh)."
[ "$(uname -m)" = x86_64 ] || die "only x86_64 is supported (the converter is a 64-bit Intel/AMD build); this machine is $(uname -m)."
# shellcheck disable=SC1091
. /etc/os-release
case "${ID:-}:${VERSION_ID:-}" in
  ubuntu:22.04|ubuntu:24.04|debian:12) ;;
  *) die "supported systems are Ubuntu 22.04, Ubuntu 24.04 and Debian 12; this is ${PRETTY_NAME:-unknown}." ;;
esac
case "$OPCV_HTTP_PORT$OPCV_ADMIN_PORT" in *[!0-9]*) die "ports must be numbers." ;; esac
[ "$OPCV_HTTP_PORT" != "$OPCV_ADMIN_PORT" ] || die "OPCV_HTTP_PORT and OPCV_ADMIN_PORT must differ."

check_apache_sites "$OPCV_HTTP_PORT"
check_port "$OPCV_HTTP_PORT"

# ---------------------------------------------------------------- 2. packages, user, Node, converter, app
say "Installing system packages"
export DEBIAN_FRONTEND=noninteractive
export LC_ALL=C.UTF-8
apt-get update -qq
apt-get install -y -qq apache2 git curl ca-certificates unzip xz-utils python3 libtbb12 acl >/dev/null

say "Creating the $SVC_USER user"
id "$SVC_USER" >/dev/null 2>&1 || useradd --system --home-dir "$SVC_HOMEDIR" --shell /usr/sbin/nologin "$SVC_USER"
if [ "$(getent passwd "$SVC_USER" | cut -d: -f6)" != "$SVC_HOMEDIR" ]; then
  systemctl stop opcviewer 2>/dev/null || true
  usermod -d "$SVC_HOMEDIR" "$SVC_USER"
fi
install -d -o root -g root -m 755 "$OPCV_HOME"
# Everything root runs or reads code from must belong to root, even if an earlier install
# or someone else changed that; uploads, trash and data stay the service user's.
for d in "$OPCV_HOME"/node* "$OPCV_HOME/potreeconverter" "$OPCV_HOME/.cache" "$APP"; do
  [ -e "$d" ] || [ -L "$d" ] || continue
  find "$d" \( -path "$APP/uploads" -o -path "$APP/trash" \) -prune -o -exec chown -h root:root {} +
done
install -d -o "$SVC_USER" -g "$SVC_USER" -m 755 "$OPCV_WWW"
install -d -o "$SVC_USER" -g "$SVC_USER" -m 750 "$OPCV_HOME/data" "$SVC_HOMEDIR"
# Read access to Apache's logs (view counts, load timings) for this user only; the default
# ACL makes the files logrotate creates later readable too.
setfacl -m "u:$SVC_USER:rx" /var/log/apache2
setfacl -d -m "u:$SVC_USER:r" /var/log/apache2
find /var/log/apache2 -maxdepth 1 -type f -name 'access.log*' -exec setfacl -m "u:$SVC_USER:r" {} +

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT
fetch() { # url sha256 output
  curl -fsSL --retry 3 -o "$3" "$1" || die "download failed: $1"
  echo "$2  $3" | sha256sum -c --quiet - || die "checksum mismatch for $1"
}

node_dir=$OPCV_HOME/node-$NODE_VERSION-linux-x64
if [ ! -x "$node_dir/bin/node" ]; then
  say "Installing Node.js $NODE_VERSION"
  fetch "https://nodejs.org/dist/$NODE_VERSION/node-$NODE_VERSION-linux-x64.tar.xz" "$NODE_SHA256" "$tmp/node.tar.xz"
  tar -xJf "$tmp/node.tar.xz" -C "$OPCV_HOME"
fi
ln -sfn "$node_dir" "$OPCV_HOME/node"

pc_dir=$OPCV_HOME/potreeconverter
if [ "$(cat "$pc_dir/.version" 2>/dev/null)" != "$PC_VERSION" ]; then
  say "Installing PotreeConverter $PC_VERSION"
  fetch "$PC_URL" "$PC_SHA256" "$tmp/pc.zip"
  unzip -q "$tmp/pc.zip" -d "$tmp/pc"
  rm -rf "$pc_dir"
  mv "$tmp/pc/PotreeConverter_${PC_VERSION}_x64_linux" "$pc_dir"
  chmod 755 "$pc_dir/PotreeConverter"
  echo "$PC_VERSION" > "$pc_dir/.version"
fi

say "Getting opcviewer ($OPCV_BRANCH)"
if [ -d "$APP/.git" ]; then
  git -C "$APP" fetch -q origin "$OPCV_BRANCH"
  git -C "$APP" checkout -q "$OPCV_BRANCH"
  git -C "$APP" merge -q --ff-only "origin/$OPCV_BRANCH" || die "$APP has local changes; update it by hand."
else
  git clone -q --branch "$OPCV_BRANCH" "$OPCV_REPO" "$APP"
fi
install -d -o "$SVC_USER" -g "$SVC_USER" -m 750 "$APP/uploads" "$APP/trash"

say "Installing Node.js packages"
(cd "$APP" && PATH="$OPCV_HOME/node/bin:$PATH" npm ci --omit=dev --no-audit --no-fund --loglevel=error)
# npm does not run puppeteer's own download step; fetch the headless browser for thumbnails
# and the system libraries it needs (needs root for apt).
(cd "$APP" && PUPPETEER_CACHE_DIR="$OPCV_HOME/.cache/puppeteer" PATH="$OPCV_HOME/node/bin:$PATH" \
  npx --yes puppeteer browsers install chrome --install-deps >/dev/null)

# ---------------------------------------------------------------- 3. Apache and the project pages
say "Setting up Apache on port $OPCV_HTTP_PORT"
site=/etc/apache2/sites-available/opcviewer.conf
{
  [ "$OPCV_HTTP_PORT" = 80 ] || echo "Listen $OPCV_HTTP_PORT"
  sed -e "s#{{WWW}}#$OPCV_WWW#g" -e "s#{{PORT}}#$(admin_port "$ENV_FILE")#g" -e "s#<VirtualHost \*:80>#<VirtualHost *:$OPCV_HTTP_PORT>#" "$APP/web/apache-site.conf"
} > "$site"
a2enmod -q headers mime proxy proxy_http >/dev/null
a2ensite -q opcviewer >/dev/null
[ "$OPCV_HTTP_PORT" != 80 ] || a2dissite -q 000-default >/dev/null 2>&1 || true

as_user cp "$APP/web/htaccess" "$OPCV_WWW/.htaccess"
if ! as_user test -e "$OPCV_WWW/index.html"; then
  sed 's/{{NAME}}/opcviewer/g' "$APP/web/landing.html" | as_user tee "$OPCV_WWW/index.html" >/dev/null
fi

# Potree viewer libraries: the set PotreeConverter ships for its own pages, plus the
# loading fix, the Slovak translation and the opcviewer scripts.
libs=$OPCV_WWW/potree_libs
if ! as_user test -f "$libs/potree/potree.js"; then
  as_user cp -r "$pc_dir/resources/page_template/libs" "$libs"
fi
if ! as_user grep -q "opcviewer patch\|zameriamto patch" "$libs/potree/potree.js"; then
  as_user cp "$libs/potree/potree.js" "$libs/potree/potree.js.orig"
  as_user python3 "$APP/viewer/patch_potree.py" "$libs/potree/potree.js"
fi
as_user mkdir -p "$libs/potree/resources/lang/sk"
as_user cp "$APP/viewer/lang-sk/translation.json" "$libs/potree/resources/lang/sk/translation.json"
as_user cp "$APP"/viewer/opcviewer-*.js "$APP/viewer/opcviewer-stat.gif" "$libs/"

apache2ctl configtest 2>/dev/null || die "Apache configuration test failed (run: apache2ctl configtest)."
systemctl enable -q apache2
systemctl reload-or-restart apache2   # reload keeps other sites on this Apache running

# ---------------------------------------------------------------- 4. settings and service
say "Starting the opcviewer service"
mkdir -p "$ENV_DIR"
if [ ! -f "$ENV_FILE" ]; then
  cat > "$ENV_FILE" <<EOF
# opcviewer settings. Edit, then: systemctl restart opcviewer
OPCV_PORT=$OPCV_ADMIN_PORT
# 0.0.0.0 = reachable from your network; 127.0.0.1 = this machine only.
OPCV_HOST=0.0.0.0
OPCV_WWW_ROOT=$OPCV_WWW
OPCV_DATA_DIR=$OPCV_HOME/data
OPCV_CONVERTER_DIR=$pc_dir
OPCV_ACCESS_LOG=/var/log/apache2/access.log
# Address your clients use for the project pages, e.g. https://pointclouds.example.com
# (used by "Copy link"). Empty = the address you open the admin panel at.
OPCV_PUBLIC_URL=
# Where this machine reaches its own project pages (for thumbnails).
OPCV_LOCAL_URL=http://127.0.0.1:$OPCV_HTTP_PORT
EOF
fi
chmod 644 "$ENV_FILE"

# One-time code for setting the admin password, so nobody else on the network can set it
# first (lib/setupCode.js). Only made while no password exists.
if ! as_user test -e "$OPCV_HOME/data/config.json" && ! as_user test -e "$OPCV_HOME/data/setup-code.txt"; then
  code=$(cd / && python3 -I -c "import secrets; a='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789'; c=''.join(secrets.choice(a) for _ in range(12)); print('-'.join(c[i:i+4] for i in (0, 4, 8)))")
  printf '%s\n' "$code" | as_user tee "$OPCV_HOME/data/setup-code.txt" >/dev/null
fi

cat > "$UNIT" <<EOF
[Unit]
Description=opcviewer admin panel
After=network.target apache2.service

[Service]
Type=simple
User=$SVC_USER
Group=$SVC_USER
WorkingDirectory=$APP
EnvironmentFile=$ENV_FILE
Environment=HOME=$SVC_HOMEDIR
Environment=PUPPETEER_CACHE_DIR=$OPCV_HOME/.cache/puppeteer
ExecStart=$OPCV_HOME/node/bin/node $APP/server.js
Restart=on-failure
RestartSec=3
NoNewPrivileges=true
PrivateTmp=true
ProtectSystem=full

[Install]
WantedBy=multi-user.target
EOF
systemctl daemon-reload
systemctl enable -q opcviewer
systemctl restart opcviewer

port=$(sed -n 's/^OPCV_PORT=//p' "$ENV_FILE")
for _ in $(seq 1 20); do
  curl -fs -o /dev/null "http://127.0.0.1:$port/login.html" && break
  sleep 1
done
curl -fs -o /dev/null "http://127.0.0.1:$port/login.html" || die "the service did not start (journalctl -u opcviewer -n 50)."

ip=$(hostname -I 2>/dev/null | awk '{print $1}')
ip=${ip:-this-server}
web="http://$ip"
[ "$OPCV_HTTP_PORT" = 80 ] || web="$web:$OPCV_HTTP_PORT"
cat <<EOF

opcviewer is installed.

  Admin panel:    http://$ip:$port/
EOF
if as_user test -e "$OPCV_HOME/data/setup-code.txt"; then
  cat <<EOF
                  Open it and set the admin password with this setup code:
                  $(as_user cat "$OPCV_HOME/data/setup-code.txt")
EOF
fi
cat <<EOF
  Project pages:  $web/<project>/

Keep the admin panel on your own network. To share project pages online, see
docs/INSTALL.md ("Going online") in the repository. Settings: $ENV_FILE
EOF
}

[ -n "${OPCV_SOURCE_ONLY:-}" ] || main "$@"
