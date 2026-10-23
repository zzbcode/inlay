# Inlay 原始格式与提取说明 / Raw format and recipe

## 原始字节 / Raw bytes

```text
combined = carrier || payload
gap = byte_length(carrier)
payload = combined[gap : byte_length(combined)]
```

`||` 仅代表连接，不是文件中的分隔符。输出没有 Inlay 头、尾标、文件名、JSON 或魔数。零字节和任意二进制序列都按原样保留；`gap` 的单位始终是字节，不是字符。浏览器下载名称与扩展名不会转换文件内容。

There is no embedded metadata. An implementation must not silently insert delimiters or headers. Raw outputs from the original Python `encode()` and Inlay are interchangeable. Losing the offset and recipe can make extraction ambiguous; this format does not support automatic discovery.

## JSON sidecar

说明是独立 UTF-8 JSON 文件，最多 64 KiB。示例使用 3 字节载体与内容为 ASCII `abc` 的 3 字节载荷：

```json
{
  "format": "inlay",
  "version": 1,
  "gap": 3,
  "carrierName": "carrier.bin",
  "payloadName": "payload.txt",
  "payloadSize": 3,
  "combinedSize": 6,
  "payloadSha256": "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
}
```

| 字段 / Field | 约束 / Contract |
| --- | --- |
| `format` | 新说明写 `inlay`；读取器也接受旧 `file-fold`。 |
| `version` | 整数 `1`；不接受未知版本。 |
| `gap` | 非负安全整数，载体大小。 |
| `carrierName` | 可选展示信息；不能用于任意路径写入或自动打开文件。 |
| `payloadName` | 必需非空字符串，最长 4096 字符；下载前按安全文件名处理，不视为路径。 |
| `payloadSize` | 非负安全整数。 |
| `combinedSize` | 非负安全整数，必须等于 `gap + payloadSize`。 |
| `payloadSha256` | 可选，载荷原始字节的 SHA-256，恰好 64 个十六进制字符；写出小写，读取允许大写并归一化。 |

安全整数范围为 `0` 到 `9007199254740991`。布尔值、浮点小数、负数和字符串形式的大小都无效。额外未知字段可忽略；不能因未知字段而跳过已知字段的校验。原有无摘要说明仍可读取，但只能标记“未经校验”。

All sizes are integers in JavaScript's safe integer range. Readers validate known fields, ignore optional unknown fields, accept legacy recipes, and must not treat an absent checksum as a successful integrity check.

## 提取顺序 / Extraction contract

1. 检查说明结构、大小关系和摘要字段语法。
2. 若有说明，核对输入文件大小等于 `combinedSize`。
3. 确认 `0 <= gap <= combined size`，取 `combined[gap:]`。
4. 若有 `payloadSha256`，分块计算载荷摘要；不匹配则拒绝结果下载或发布。
5. 无摘要时明确标记未经校验，不能把“产生了字节”描述为内容正确。

手填 gap 使用只含十进制数字的输入。界面拒绝手填 EOF 偏移量，防止误选原载体后下载空文件；有效说明明确记录 `payloadSize: 0` 时允许空载荷。底层纯切片函数可保留 EOF 得到空 Blob 的语义；CLI 的手动 EOF 使用 `--allow-empty` 显式确认。

## 校验范围 / Integrity scope

摘要只覆盖载荷，不覆盖载体、文件名、gap 文本或说明的其他字段。相同大小的篡改应被有摘要的说明发现。空载荷 SHA-256 是：

```text
e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
```

SHA-256 不是加密、口令保护、签名或认证；攻击者可以同时替换文件与说明。载体变化而载荷不变可能仍通过校验，这是当前约定。若需要保密或可信来源，应另用经过审视的加密/签名工具。

## Python 最小互通 / Minimal Python extraction

```python
BUFF_SIZE = 1 << 20
with open("combined.bin", "rb") as source, open("payload.bin", "wb") as output:
    source.seek(gap)  # original carrier size, in bytes
    while chunk := source.read(BUFF_SIZE):
        output.write(chunk)
```

这段最小代码仅提取，不校验、不防止误覆盖。正式使用可参考 `examples/inlay.py`，其 sidecar、摘要和文件保护与本规范一致。

新增自动识别尾标或密码封装必须作为显式新格式设计；不能静默改变此原始字节合同。
