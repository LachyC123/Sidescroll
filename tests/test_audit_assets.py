from pathlib import Path
import tempfile
import unittest
import zipfile

from tools.audit_assets import category_for, normalise_pack_name, png_dimensions


class AuditHelpersTest(unittest.TestCase):
    def test_pack_version_suffix_is_removed(self):
        self.assertEqual(
            normalise_pack_name("Legacy Fantasy - Dusk Woods - 1.2.zip"),
            "Legacy Fantasy - Dusk Woods",
        )

    def test_png_dimensions_reads_ihdr(self):
        header = b"\x89PNG\r\n\x1a\n" + b"\x00\x00\x00\rIHDR" + (32).to_bytes(4, "big") + (16).to_bytes(4, "big")
        self.assertEqual(png_dimensions(header), (32, 16))

    def test_category_flags_source_art(self):
        self.assertEqual(category_for(Path("Art/background.aseprite")), "source_art")

    def test_standard_library_can_read_fixture_zip(self):
        with tempfile.TemporaryDirectory() as temporary:
            archive_path = Path(temporary) / "fixture.zip"
            with zipfile.ZipFile(archive_path, "w") as archive:
                archive.writestr("README.txt", "licence fixture")
            with zipfile.ZipFile(archive_path) as archive:
                self.assertEqual(archive.read("README.txt"), b"licence fixture")


if __name__ == "__main__":
    unittest.main()
