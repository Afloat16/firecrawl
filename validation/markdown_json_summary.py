import json
from pathlib import Path
from statistics import median


results = {"baseline": {}, "fixed": {}}
for variant in results:
    for trial in range(1, 6):
        path = Path(f"bench-{variant}-{trial}.log")
        seen = set()
        for line in path.read_text().splitlines():
            if not line.startswith("BenchmarkConvertHTMLJSON/"):
                continue
            fields = line.split()
            name = fields[0].rsplit("-", 1)[0]
            if len(fields) < 6 or not fields[1].isdigit():
                continue
            values = dict(zip(fields[3::2], map(float, fields[2::2])))
            assert {"ns/op", "response-B", "B/op", "allocs/op"} <= values.keys(), values
            assert name not in seen, (path, name)
            seen.add(name)
            results[variant].setdefault(name, []).append(values)
        assert len(seen) == 6, (path, seen)

assert results["baseline"].keys() == results["fixed"].keys()
summary = {}
for name, before in results["baseline"].items():
    after = results["fixed"][name]
    assert len(before) == len(after) == 5
    baseline = {key: median(row[key] for row in before) for key in before[0]}
    fixed = {key: median(row[key] for row in after) for key in after[0]}
    for sample in before:
        assert sample["response-B"] == baseline["response-B"]
    for sample in after:
        assert sample["response-B"] == fixed["response-B"]
    if "/prose/" in name:
        assert fixed["response-B"] == baseline["response-B"]
    else:
        assert fixed["response-B"] < baseline["response-B"]
    summary[name] = {
        "baseline_median": baseline,
        "fixed_median": fixed,
        "response_reduction_percent": 100 * (1 - fixed["response-B"] / baseline["response-B"]),
        "time_change_percent": 100 * (fixed["ns/op"] / baseline["ns/op"] - 1),
        "bytes_allocated_change_percent": 100 * (fixed["B/op"] / baseline["B/op"] - 1),
    }

output = {
    "rounds": 5,
    "GOMAXPROCS": 2,
    "source": "564b6baf91781e7c1119c9728a327e6a30a35069",
    "baseline": "dc37f52f9670be4ef3077f97f31096b2d0657205",
    "note": "Complete handler benchmarks use httptest recorders; response-B is uncompressed JSON bytes, not total network traffic. B/op is cumulative Go allocation, not peak live heap or RSS.",
    "workloads": summary,
}
Path("markdown-json-summary.json").write_text(json.dumps(output, indent=2) + "\n")
print(json.dumps(output, indent=2))
