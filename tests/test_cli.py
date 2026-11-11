import pytest

from hisaab.cli import build_parser, main


def test_parser_defaults_and_subcommand():
    args = build_parser().parse_args([])
    assert args.port == 8765 and args.host == "127.0.0.1" and args.command is None
    assert build_parser().parse_args(["backup"]).command == "backup"
    assert build_parser().parse_args(["--demo", "--window"]).window


def test_backup_command(tmp_path, capsys):
    with pytest.raises(SystemExit, match="No data yet"):
        main(["--data-dir", str(tmp_path), "backup"])
    from hisaab.db import open_database

    open_database(tmp_path / "hisaab.db").close()
    main(["--data-dir", str(tmp_path), "backup"])
    out = capsys.readouterr().out.strip()
    assert out.endswith("-manual.db") and (tmp_path / "backups").exists()
