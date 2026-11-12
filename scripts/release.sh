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
# Os testes de integração também rodam no Fedora 44 (distro do usuário) e no
# Debian 13 (Plasma 6.3, o mais antigo suportado; lá os que dependem de
# screenshot ou de animação são pulados).
(cd tests && KUBIK_TESTENV=fedora python3 -m unittest discover -p 'test_kwin_*.py')
(cd tests && KUBIK_TESTENV=debian python3 -m unittest discover -p 'test_kwin_*.py')

ID=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Id"])' "$PKG/metadata.json")
VERSION=$(python3 -c 'import json,sys; print(json.load(open(sys.argv[1]))["KPlugin"]["Version"])' "$PKG/metadata.json")
TAG="$ID-v$VERSION"

if git rev-parse -q --verify "refs/tags/$TAG" >/dev/null; then
    echo "erro: a tag $TAG já existe; aumente KPlugin.Version em $PKG/metadata.json" >&2; exit 1
fi

mapfile -t FILES < <(python3 scripts/build.py "$PKG")
# Instalador AppImage, feito do .tar.gz (só o do Kubik tem; o protótipo não).
TARBALL=$(printf '%s\n' "${FILES[@]}" | grep '\.tar\.gz$')
if [ "$ID" = kubik ]; then
    FILES=("$(scripts/appimage.sh "$TARBALL" dist)" "${FILES[@]}")
fi

NOTES=$(cat <<EOF
Versão de teste **$VERSION** de \`$ID\` (commit $(git rev-parse --short HEAD)).

**Instalar (escolha um):**
- **Mais fácil:** baixe \`Kubik-$VERSION-x86_64.AppImage\`, marque como executável (botão direito › Propriedades › Permissões) e abra com dois cliques: o gerenciador oferece instalar, atualizar, reparar ou remover, conforme o que já está no sistema.
- Terminal: \`tar xzf $ID-$VERSION.tar.gz && ./$ID-$VERSION/install.sh\`

Depois, o **Kubik** no menu abre o mesmo gerenciador.
Pelo terminal: \`./$ID-$VERSION/uninstall.sh\`
EOF
)

git tag -a "$TAG" -m "$ID $VERSION"
git push origin HEAD --follow-tags
gh release create "$TAG" "${FILES[@]}" --prerelease --title "$ID $VERSION" --notes "$NOTES"
