import pytest

from paim_script import ScriptError, base_len, long_tokens, parse_script

SRC = "# ETF กับหุ้น\n\n> note\nl01: ETF กับหุ้น ต่างกันยังไง\nl02: หุ้นคือ การซื้อ บริษัทเดียว\n"


def test_parse():
    lines = parse_script(SRC)
    assert [l["id"] for l in lines] == ["l01", "l02"]
    assert lines[0]["tokens"] == ["ETF", "กับหุ้น", "ต่างกันยังไง"]
    assert lines[0]["text"] == "ETF กับหุ้น ต่างกันยังไง"


def test_duplicate_id_raises():
    with pytest.raises(ScriptError):
        parse_script("l01: ก\nl01: ข")


def test_no_lines_raises():
    with pytest.raises(ScriptError):
        parse_script("# only a title")


def test_base_len():
    assert base_len("ที่") == 1
    assert base_len("น้ำ") == 2
    assert base_len("ETF กับ") == 5


def test_long_tokens():
    assert long_tokens(parse_script("l01: " + "ก" * 15 + " ข")) == [("l01", "ก" * 15)]
    assert long_tokens(parse_script("l01: " + "ก" * 14 + " ข")) == []


@pytest.mark.parametrize("src", ["l01:", "l01: ก\nl02:   \nl03: ข"])
def test_empty_spoken_line_raises(src):
    with pytest.raises(ScriptError):
        parse_script(src)
