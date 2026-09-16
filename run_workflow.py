#!/usr/bin/env python3
"""
CLI for the character + fal.ai/Muse master workflow described in
docs/workflow-fal-ai-muse.md.

Examples:
    export FAL_KEY=your-key-here

    python run_workflow.py status
    python run_workflow.py character --reference-photo photos/me.jpg
    python run_workflow.py location
    python run_workflow.py character-sheet
    python run_workflow.py location-sheet
    python run_workflow.py shot 1
    python run_workflow.py shot 1 2 3 4 5 6 7
    python run_workflow.py all --reference-photo photos/me.jpg
"""

import argparse
import sys

from workflow import pipeline, prompts


def main() -> int:
    parser = argparse.ArgumentParser(description="fal.ai / Muse character workflow runner")
    subparsers = parser.add_subparsers(dest="command", required=True)

    p_status = subparsers.add_parser("status", help="show which assets are already locked")

    p_character = subparsers.add_parser("character", help="generate MASTER_CHARACTER_REFERENCE")
    p_character.add_argument(
        "--reference-photo",
        help="local path to a real photo to use as an image-to-image identity anchor",
    )
    p_character.add_argument("--force", action="store_true", help="regenerate even if already locked")

    p_location = subparsers.add_parser("location", help="generate MASTER_LOCATION_REFERENCE")
    p_location.add_argument("--force", action="store_true", help="regenerate even if already locked")

    p_char_sheet = subparsers.add_parser("character-sheet", help="generate MASTER_CHARACTER_SHEET")
    p_char_sheet.add_argument("--force", action="store_true")

    p_loc_sheet = subparsers.add_parser("location-sheet", help="generate MASTER_LOCATION_SHEET")
    p_loc_sheet.add_argument("--force", action="store_true")

    p_shot = subparsers.add_parser("shot", help="generate one or more video shots (1-7)")
    p_shot.add_argument("numbers", nargs="+", type=int, choices=prompts.SHOT_ORDER)
    p_shot.add_argument("--force", action="store_true")

    p_all = subparsers.add_parser("all", help="run the full pipeline in order")
    p_all.add_argument(
        "--reference-photo",
        help="local path to a real photo to use as an image-to-image identity anchor",
    )
    p_all.add_argument("--force", action="store_true", help="regenerate every step even if locked")

    args = parser.parse_args()

    if args.command == "status":
        pipeline.print_status()
    elif args.command == "character":
        pipeline.generate_character_reference(args.reference_photo, force=args.force)
    elif args.command == "location":
        pipeline.generate_location_reference(force=args.force)
    elif args.command == "character-sheet":
        pipeline.generate_character_sheet(force=args.force)
    elif args.command == "location-sheet":
        pipeline.generate_location_sheet(force=args.force)
    elif args.command == "shot":
        for number in args.numbers:
            pipeline.generate_shot(number, force=args.force)
    elif args.command == "all":
        pipeline.run_all(args.reference_photo, force=args.force)

    return 0


if __name__ == "__main__":
    sys.exit(main())
