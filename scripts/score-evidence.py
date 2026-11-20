#!/usr/bin/env python3
"""Recompute H/C/T/D from supplied evidence. Does not solve or overwrite the input.

A lone question object is reported as one question. A file with a questions
array is one analysis unit and uses the studio statistics wording.
"""
import argparse
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
from modules.studio.scoring import ValidationError, score_paper, score_question


def score_input(data):
    if not isinstance(data, dict):
        raise ValidationError('input must be an object')
    if 'questions' in data and 'steps' in data:
        raise ValidationError('ambiguous input: both steps and questions')
    if 'questions' not in data:
        return {'algorithm': 'HCT-rules-v1.1', 'engine': '0.1.2', 'question': score_question(data)}
    if not isinstance(data['questions'], list):
        raise ValidationError('questions must be a non-empty list')
    return score_paper(data['questions'])


def main(argv=None):
    parser = argparse.ArgumentParser(description='复算已有证据的 H/C/T/D。不自动解题，也不覆盖输入文件。')
    parser.add_argument('input', type=Path, help='单个小问对象，或含 questions 数组的 JSON')
    parser.add_argument('--output', type=Path, help='结果 JSON。省略则写到标准输出。不能与输入为同一路径。')
    args = parser.parse_args(argv)
    try:
        data = json.loads(args.input.read_text(encoding='utf-8-sig'))
        text = json.dumps(score_input(data), ensure_ascii=False, indent=2, allow_nan=False) + '\n'
        if args.output:
            if args.output.resolve() == args.input.resolve():
                raise ValidationError('output must not overwrite the input evidence')
            args.output.parent.mkdir(parents=True, exist_ok=True)
            args.output.write_text(text, encoding='utf-8')
        else:
            sys.stdout.write(text)
    except (OSError, ValueError, TypeError) as exc:
        print(f'输入或计算错误：{exc}', file=sys.stderr)
        return 2
    return 0


if __name__ == '__main__':
    raise SystemExit(main())
