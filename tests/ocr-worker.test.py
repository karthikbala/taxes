import importlib.util
from pathlib import Path
import unittest

spec = importlib.util.spec_from_file_location("pdf_ocr", Path(__file__).parents[1]/"workers/pdf_ocr.py")
ocr = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ocr)
HEADER = "level\tpage_num\tblock_num\tpar_num\tline_num\tword_num\tleft\ttop\twidth\theight\tconf\ttext\n"


class OcrTests(unittest.TestCase):
    def test_words_preserve_confidence_geometry_and_exact_characters(self):
        tsv = HEADER + "5\t1\t1\t1\t1\t1\t100\t200\t100\t40\t97.5\tReceipt\n" + "5\t1\t1\t1\t1\t2\t210\t200\t20\t40\t61\t#\n" + "5\t1\t1\t1\t1\t3\t900\t200\t100\t40\t72\t$1O0.00\n"
        items, words = ocr.parse_tsv(tsv, 2, 612, 792, 2550, 3300)
        self.assertEqual([i['str'] for i in items], ['Receipt #', '$1O0.00'])
        self.assertEqual(len(words), 3)
        self.assertEqual(items[0]['confidence'], 61)
        self.assertEqual(items[0]['page'], 2)
        self.assertAlmostEqual(items[0]['x'], 24)
        self.assertAlmostEqual(items[0]['y'], 734.4)
        self.assertEqual(words[2]['str'], '$1O0.00')  # Never silently repair financial digits.

    def test_invalid_bounds_confidence_and_headers_fail(self):
        for row in ["-1\t10\t20\t20\t90", "2500\t10\t100\t20\t90", "10\t10\t20\t20\tnan", "10\t10\t20\t20\t101"]:
            tsv = HEADER + "5\t1\t1\t1\t1\t1\t" + row + "\ttext\n"
            with self.assertRaisesRegex(ValueError, 'document_ocr_invalid_output'):
                ocr.parse_tsv(tsv, 1, 612, 792, 2550, 3300)
        with self.assertRaisesRegex(ValueError, 'document_ocr_invalid_output'):
            ocr.parse_tsv('text\nhello', 1, 612, 792, 2550, 3300)

    def test_nonword_rows_and_empty_text_are_not_invented(self):
        items, words = ocr.parse_tsv(HEADER + '1\t1\t0\t0\t0\t0\t0\t0\t2550\t3300\t-1\t\n', 1, 612, 792, 2550, 3300)
        self.assertEqual(items, [])
        self.assertEqual(words, [])

    def test_printed_year_stays_separate_from_adjacent_document_heading(self):
        tsv = HEADER + "5\t1\t1\t1\t1\t1\t100\t200\t100\t40\t97\t2025\n" + "5\t1\t1\t1\t1\t2\t210\t200\t200\t40\t91\tDelinquent\n"
        items, _ = ocr.parse_tsv(tsv, 1, 612, 792, 2550, 3300)
        self.assertEqual([i['str'] for i in items], ['2025', 'Delinquent'])

    def test_rejects_invalid_and_oversized_input_before_tools(self):
        with self.assertRaisesRegex(ValueError, 'document_not_pdf'):
            ocr.extract(b'not a pdf')
        with self.assertRaisesRegex(ValueError, 'source_too_large'):
            ocr.extract(b'%PDF-' + b' ' * ocr.MAX_BYTES)


if __name__ == '__main__':
    unittest.main()
