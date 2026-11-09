#!/usr/bin/env bash
# Publica uma versão de teste como GitHub Release (pré-release) com os pacotes anexados.
# Uso: scripts/release.sh [diretório-do-pacote]   (padrão: kubik/package)
# A versão vem de KPlugin.Version no metadata.json; a tag é <Id>-v<Versão>.
set -euo pipefail

cd "$(dirname "$0")/.."
PKG=${1:-kubik/package}

if [ -n "$(git status --porcelain)" ]; then
    echo "erro: há mudanças não commitadas" >&2; exit 1
fi

python3 -m unittest discover -s tests
# Os testes de integração também rodam no Fedora 44 (distro do usuário).
(cd tests && KUBIK_TESTENV=fedora python3 -m unittest discover -p 'test_kwin_*.py')

ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Id"])' "$PKG/metadata.json")
VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' "$PKG/metadata.json")
TAG="$ID-v$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "erro: a tag $TAG já existe; aumente KPlugin.Version em $PKG/metadata.json" >&2; exit 1
fi

mapfile -t FILES < <(python3 scripts/build.py "$PKG")

NOTES=$(cat <<EOF
Versão de teste **$VERSION** de \`$ID\` (commit $(git rev-parse --short HEAD)).

**Instalar (escolha um):**
- Configurações do Sistema › Scripts do KWin › *Instalar de arquivo…* › \`$ID-$VERSION.kwinscript\`
- \`tar xzf $ID-$VERSION.tar.gz && ./$ID-$VERSION/install.sh\`

Para remover: \`./$ID-$VERSION/uninstall.sh\`
EOF
)

git tag -a "$TAG" -m "$ID $VERSION"
git push origin HEAD --follow-tags
gh release create "$TAG" "${FILES[@]}" --prerelease --title "$ID $VERSION" --notes "$NOTES"
