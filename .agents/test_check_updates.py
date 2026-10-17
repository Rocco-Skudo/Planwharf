"""Offline regression checks for upstream skill comparison and failure reporting."""
import contextlib
import hashlib
import importlib.util
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('skill_updates', Path(__file__).with_name('check-updates.py'))
checker = importlib.util.module_from_spec(spec)
spec.loader.exec_module(checker)


class UpdateChecks(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        local = self.root / '.agents/skills/example'
        local.mkdir(parents=True)
        (local / 'SKILL.md').write_bytes(b'original')
        self.revision = 'a' * 40
        self.latest = 'b' * 40
        self.baseline = {'skills/example/SKILL.md': hashlib.sha1(b'blob 8\0original').hexdigest(),
                         'unrelated.txt': 'old'}
        self.current = dict(self.baseline)
        self.manifest = self.root / '.agents/example-install.json'
        self.manifest.write_text(json.dumps({
            'source': 'https://github.com/example/skills', 'revision': self.revision,
            'skills': [{'name': 'example', 'upstreamPath': 'skills/example'}]}))

    def run_check(self, offline=False, failure=None):
        def api(path):
            if failure:
                raise failure
            if '/commits?' in path:
                return [{'sha': self.latest}]
            entries = self.baseline if self.revision in path else self.current
            return {'tree': [{'path': name, 'sha': sha, 'type': 'blob'}
                             for name, sha in entries.items()]}
        output = io.StringIO()
        with patch.object(checker, 'fetch_json', side_effect=api) as fetch:
            with contextlib.redirect_stdout(output):
                status = checker.check(self.root, offline)
        return status, output.getvalue(), fetch.call_count

    def test_unrelated_commits_are_not_skill_updates(self):
        self.current['unrelated.txt'] = 'new'
        status, output, _ = self.run_check()
        self.assertEqual(status, 0)
        self.assertIn('UP TO DATE', output)
        self.assertNotIn('LOCAL DIFFERENCES', output)

    def test_supporting_file_addition_is_an_update(self):
        self.current['skills/example/reference.md'] = 'new'
        status, output, _ = self.run_check()
        self.assertEqual(status, 0)
        self.assertIn('UPDATES AVAILABLE for installed skills: example', output)

    def test_deleted_upstream_skill_is_an_update(self):
        del self.current['skills/example/SKILL.md']
        self.assertIn('UPDATES AVAILABLE', self.run_check()[1])

    def test_local_adaptations_are_reported_and_preserved(self):
        path = self.root / '.agents/skills/example/SKILL.md'
        path.write_bytes(b'adapted')
        self.assertIn('LOCAL DIFFERENCES', self.run_check()[1])
        self.assertEqual(path.read_bytes(), b'adapted')

    def test_network_failure_is_unknown(self):
        status, output, _ = self.run_check(failure=OSError('offline'))
        self.assertEqual(status, 1)
        self.assertIn('UNKNOWN', output)
        self.assertNotIn('UP TO DATE', output)

    def test_offline_validation_does_not_access_network(self):
        status, output, calls = self.run_check(offline=True)
        self.assertEqual(status, 0)
        self.assertEqual(calls, 0)
        self.assertIn('NOT CHECKED', output)

    def test_missing_local_skill_is_unknown(self):
        (self.root / '.agents/skills/example/SKILL.md').unlink()
        self.assertEqual(self.run_check()[0], 1)

    def test_truncated_tree_is_unknown(self):
        output = io.StringIO()
        with patch.object(checker, 'fetch_json', side_effect=[
            [{'sha': self.latest}], {'truncated': True, 'tree': []}]):
            with contextlib.redirect_stdout(output):
                self.assertEqual(checker.check(self.root), 1)
        self.assertIn('incomplete tree', output.getvalue())


if __name__ == '__main__':
    unittest.main()
