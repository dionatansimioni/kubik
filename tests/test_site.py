"""O site (site/, publicado no GitHub Pages) e as imagens dos READMEs.

A lógica do botão de download (site/download.js) é testada no Vitest
(kubik/test/site.test.ts); aqui, a página e os arquivos que ela usa.
"""
import re
import unittest
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SITE = ROOT / "site"


class Refs(HTMLParser):
    def __init__(self):
        super().__init__()
        self.local, self.scripts, self.i18n = [], [], set()

    def handle_starttag(self, tag, attrs):
        a = dict(attrs)
        for key in ("src", "href"):
            v = a.get(key)
            if v and not re.match(r"^(https?:|#|mailto:)", v):
                self.local.append(v)
        if tag == "script" and a.get("src"):
            self.scripts.append(a["src"])
        for key in ("data-i18n", "data-i18n-html"):
            if a.get(key):
                self.i18n.add(a[key])


class SiteTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.html = (SITE / "index.html").read_text(encoding="utf-8")
        cls.refs = Refs()
        cls.refs.feed(cls.html)

    def test_local_files_exist(self):
        self.assertIn("images/hero.png", self.refs.local)
        for ref in self.refs.local:
            self.assertTrue((SITE / ref).is_file(), ref)
        # O módulo importado pelo script inline.
        for mod in re.findall(r'from "\./([^"]+)"', self.html):
            self.assertTrue((SITE / mod).is_file(), mod)

    def test_no_external_scripts(self):
        self.assertEqual(self.refs.scripts, [])

    def test_every_text_has_a_portuguese_version(self):
        pt = re.search(r"const PT = \{(.*?)\n\};", self.html, re.S).group(1)
        keys = set(re.findall(r"^\s*(\w+):", pt, re.M))
        self.assertEqual(self.refs.i18n - keys, set())

    def test_english_by_default(self):
        # Inglês por padrão; português só pelo botão ou por ?lang=pt (pedido do autor).
        self.assertIn('<html lang="en">', self.html)
        self.assertNotIn("navigator.language", self.html)
        self.assertIn('|| "en");', self.html)

    def test_download_falls_back_to_the_releases_page(self):
        # Sem JavaScript ou sem a API: os links de download levam à página de releases.
        for a in re.findall(r'<a class="[^"]*download[^"]*" href="([^"]+)"', self.html):
            self.assertEqual(a, "https://github.com/dionatansimioni/kubik/releases")

    def test_workflow_publishes_the_site_folder(self):
        wf = (ROOT / ".github" / "workflows" / "pages.yml").read_text()
        self.assertIn("path: site", wf)
        self.assertIn("actions/deploy-pages", wf)


class ReadmeImagesTest(unittest.TestCase):
    def test_images_exist_and_gifs_are_light(self):
        for readme in (ROOT / "README.md", ROOT / "kubik" / "README.md"):
            text = readme.read_text(encoding="utf-8")
            refs = re.findall(r"!\[[^\]]*\]\(([^)]+)\)", text) + re.findall(r'<img src="([^"]+)"', text)
            local = [r for r in refs if not r.startswith("http")]
            self.assertTrue(local, readme)
            for ref in local:
                path = (readme.parent / ref).resolve()
                self.assertTrue(path.is_file(), f"{readme.name}: {ref}")
                if path.suffix == ".gif":
                    # O GitHub mostra GIFs grandes devagar (ou nem mostra).
                    self.assertLess(path.stat().st_size, 5_000_000, ref)


if __name__ == "__main__":
    unittest.main()
