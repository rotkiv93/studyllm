#!/bin/sh
# Release bookkeeping, same model as usecornercase/cornercase-terminal: the PR that changes the app
# also bumps the version and adds its CHANGELOG.md section; merging to main tags and releases it.
#
#   version.sh check <base-ref>   PR gate: app changed => version bumped above the last tag + changelog section
#   version.sh release            on main: tag vX.Y.Z (if new) and dispatch the Release workflow
#   version.sh set <X.Y.Z>        bump every file that carries the version
#   version.sh notes <X.Y.Z>      print that version's CHANGELOG.md section (used as the release body)
set -eu

# Paths whose changes ship to users. Docs, CI and the like don't need a new version.
APP="src src-tauri package.json package-lock.json index.html vite.config.ts"

fail() {
    echo "::error::$1"
    exit 1
}

pkg_version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' package.json | head -n 1)
tauri_version=$(sed -n 's/^  "version": "\(.*\)",$/\1/p' src-tauri/tauri.conf.json | head -n 1)
cargo_version=$(sed -n 's/^version = "\(.*\)"$/\1/p' src-tauri/Cargo.toml | head -n 1)
lock_version=$(awk '/^name = "studyllm"$/ { getline; sub(/^version = "/, ""); sub(/"$/, ""); print; exit }' src-tauri/Cargo.lock)
version=$tauri_version
latest=$(git tag --list 'v*' --sort=-v:refname | head -n 1 | sed 's/^v//')

newer() {
    [ "$1" != "$2" ] && [ "$(printf '%s\n%s\n' "$1" "$2" | sort -V | tail -n 1)" = "$1" ]
}

in_lockstep() {
    [ "$pkg_version" = "$version" ] && [ "$cargo_version" = "$version" ] && [ "$lock_version" = "$version" ] ||
        fail "version mismatch: package.json=$pkg_version tauri.conf.json=$tauri_version Cargo.toml=$cargo_version Cargo.lock=$lock_version. Run: sh .github/version.sh set <X.Y.Z>"
}

notes() {
    awk -v h="## $1" '$0 == h { on = 1; next } /^## / { on = 0 } on' CHANGELOG.md
}

check() {
    in_lockstep
    changed=$(git diff --name-only "$1"...HEAD -- $APP)
    if [ -z "$changed" ]; then
        echo "no app changes, no new version needed"
        return
    fi
    if [ -n "$latest" ] && ! newer "$version" "$latest"; then
        fail "this pull request changes the app, so it needs a new version: run 'sh .github/version.sh set <X.Y.Z>' with X.Y.Z above $latest (the last release) and add a '## X.Y.Z' section to CHANGELOG.md"
    fi
    [ -n "$(notes "$version")" ] || fail "add a '## $version' section to CHANGELOG.md with what changed for users"
    echo "this pull request releases $version"
}

release() {
    in_lockstep
    tag="v$version"
    if git rev-parse -q --verify "refs/tags/$tag" >/dev/null; then
        changed=$(git diff --name-only "$tag" HEAD -- $APP)
        if [ -n "$changed" ]; then
            echo "::notice::$tag is already released and the app changed since (e.g. a Dependabot bump); it ships with the next version"
        else
            echo "$tag is already released"
        fi
        return
    fi
    [ -n "$(notes "$version")" ] || fail "no '## $version' section in CHANGELOG.md; refusing to release $tag"
    git tag "$tag"
    git push origin "$tag"
    gh workflow run release.yml --ref "$tag" -f tag="$tag"
    echo "releasing $tag"
}

set_version() {
    new=${1:?usage: version.sh set <X.Y.Z>}
    case "$new" in
        [0-9]*.[0-9]*.[0-9]*) ;;
        *) fail "not a version: $new" ;;
    esac
    npm version "$new" --no-git-tag-version --allow-same-version >/dev/null
    sed -i "0,/^  \"version\": \".*\",\$/s//  \"version\": \"$new\",/" src-tauri/tauri.conf.json
    sed -i "0,/^version = \".*\"\$/s//version = \"$new\"/" src-tauri/Cargo.toml
    (cd src-tauri && cargo update --workspace --quiet)
    echo "version set to $new in package.json, package-lock.json, tauri.conf.json, Cargo.toml, Cargo.lock"
}

case "${1:-}" in
    check) check "${2:?usage: version.sh check <base-ref>}" ;;
    release) release ;;
    set) set_version "${2:-}" ;;
    notes) notes "${2:?usage: version.sh notes <X.Y.Z>}" ;;
    *) fail "usage: version.sh check <base> | release | set <X.Y.Z> | notes <X.Y.Z>" ;;
esac
