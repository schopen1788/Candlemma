"""03~11 단계를 순서대로 실행 (01, 02 수집은 따로)."""
import runpy
import sys

STEPS = ["03_features", "04_scan_patterns", "05_label", "06_pattern_stats", "07_sample_balance", "07b_fetch_disclosures",
         "08_difficulty", "09_explain", "10_export", "11_upload"]

if __name__ == "__main__":
    for s in STEPS:
        print(f"== {s}", flush=True)
        sys.argv = [s + ".py"]
        runpy.run_path(s + ".py", run_name="__main__")
