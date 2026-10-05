"""Generate small, original-content EPUB2/3 fixtures with no network dependencies."""
from pathlib import Path
from zipfile import ZipFile, ZIP_STORED, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parent
ROOT.joinpath('sample.txt').write_text(
    '\ufeffChương 1: Đêm mưa\n\nAn đặt tách trà xuống bàn. "Đường về còn xa", cô nói. 🌧️\n'
    'Cậu ghi chú: á, dấu ghép và đường dẫn C:\\notes.\n\n'
    'Chương 2: Bình minh\n\nÁnh sáng đi qua ô cửa. Một trang sách mới bắt đầu.\n',
    encoding='utf-8')

for version in (2, 3):
    nav = ('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>'
           if version == 3 else '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>')
    package = f'''<?xml version="1.0" encoding="UTF-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="{version}.0" unique-identifier="uid">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:identifier id="uid">nide-original-{version}</dc:identifier><dc:title>Đêm mưa</dc:title><dc:creator>NIDE fixtures</dc:creator><dc:language>vi</dc:language></metadata>
<manifest><item id="one" href="one.xhtml" media-type="application/xhtml+xml"/><item id="two" href="two.xhtml" media-type="application/xhtml+xml"/>{nav}</manifest>
<spine{' toc="ncx"' if version == 2 else ''}><itemref idref="one"/><itemref idref="two"/></spine></package>'''
    entries = {
        'META-INF/container.xml': '<?xml version="1.0"?><container xmlns="urn:oasis:names:tc:opendocument:xmlns:container" version="1.0"><rootfiles><rootfile full-path="OEBPS/book.opf" media-type="application/oebps-package+xml"/></rootfiles></container>',
        'OEBPS/book.opf': package,
        'OEBPS/one.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Đêm mưa</title></head><body><h1>Đêm mưa</h1><p>An đặt <strong>tách trà</strong> xuống bàn. 🌧️</p><p><a href="#note">Ghi chú</a></p><aside id="note"><p>Mưa sẽ tạnh.</p></aside></body></html>',
        'OEBPS/two.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml"><head><title>Bình minh</title></head><body><h1>Bình minh</h1><p>Ánh sáng đi qua ô cửa.</p></body></html>',
        'OEBPS/nav.xhtml': '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops"><body><nav epub:type="toc"><ol><li><a href="one.xhtml">Đêm mưa</a></li></ol></nav></body></html>',
        'OEBPS/toc.ncx': '<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><navMap><navPoint id="one" playOrder="1"><navLabel><text>Đêm mưa</text></navLabel><content src="one.xhtml"/></navPoint></navMap></ncx>'
    }
    with ZipFile(ROOT / f'sample-epub{version}.epub', 'w') as archive:
        archive.writestr('mimetype', 'application/epub+zip', compress_type=ZIP_STORED)
        for path, text in entries.items():
            if (version == 2 and path.endswith('nav.xhtml')) or (version == 3 and path.endswith('toc.ncx')):
                continue
            archive.writestr(path, text.encode('utf-8'), compress_type=ZIP_DEFLATED)
print('Generated original-content TXT and EPUB2/3 fixtures.')
