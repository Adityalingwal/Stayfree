import json
import random
from pathlib import Path

# Goal: Create `data/seeds_v2/validation.jsonl` with 30 unique examples per bucket from `data/seeds_v1`.
# CRITICAL: Must not overlap with data/splits_v1/val.jsonl or data/splits_v1/test.jsonl.

def get_forbidden_inputs():
    forbidden = set()
    
    # 1. Parse splits_v1/test.jsonl and splits_v1/val.jsonl
    splits_v1_dir = Path("/Users/mac/Desktop/StayFree/formatter-fine-tuning/data/splits_v1")
    for fname in ["val.jsonl", "test.jsonl"]:
        fpath = splits_v1_dir / fname
        if not fpath.exists():
            continue
        with open(fpath) as f:
            for line in f:
                if not line.strip(): continue
                obj = json.loads(line)
                # Split format uses messages structure
                if "messages" in obj:
                    for msg in obj["messages"]:
                        if msg["role"] == "user":
                            forbidden.add(msg["content"].strip().lower())
                            
    # 2. Parse any V2 data just in case to be perfectly clean
    v2_files = Path("/Users/mac/Desktop/StayFree/formatter-fine-tuning/data/seeds_v2").glob("*.jsonl")
    for fpath in v2_files:
        with open(fpath) as f:
            for line in f:
                if not line.strip(): continue
                obj = json.loads(line)
                if "input" in obj:
                    forbidden.add(obj["input"].strip().lower())

    return forbidden

def run():
    forbidden = get_forbidden_inputs()
    print(f"Loaded {len(forbidden)} forbidden inputs to cross-check.")
    
    v1_dir = Path("/Users/mac/Desktop/StayFree/formatter-fine-tuning/data/seeds_v1")
    output_path = Path("/Users/mac/Desktop/StayFree/formatter-fine-tuning/data/seeds_v2/validation.jsonl")
    
    # Define our 10 target buckets explicitly
    target_buckets = [
        "basic_formatting.jsonl",
        "numbers_formatting.jsonl",
        "dictionary.jsonl",
        "self_correction.jsonl",
        "edge_cases.jsonl",
        "hinglish.jsonl",
        "other_apps.jsonl",
        "voice_commands.jsonl",
        "email_context.jsonl",
        "asr_errors.jsonl"
    ]
    
    total_extracted = 0
    validation_data = []

    random.seed(42) # Ensure reproducability
    
    for bucket_file in target_buckets:
        fpath = v1_dir / bucket_file
        if not fpath.exists():
            print(f"Warning: {fpath.name} not found in V1! Skipping.")
            continue
            
        # Load all valid examples from this V1 bucket
        valid_examples = []
        with open(fpath) as f:
            for line in f:
                if not line.strip(): continue
                obj = json.loads(line)
                
                # Exclude if it was in the forbidden lists (test_v1, val_v1, any of v2)
                inp_text = obj.get("input", "").strip().lower()
                if inp_text not in forbidden:
                    valid_examples.append(obj)
                    
        # Shuffle to pick random
        random.shuffle(valid_examples)
        
        # Pick 30 (or all if less than 30 are available)
        selected = valid_examples[:30]
        validation_data.extend(selected)
        total_extracted += len(selected)
        
        print(f"Extracted {len(selected)} safe examples from {bucket_file}")

    # Write out to seeds_v2/validation.jsonl in the same SEED format (not split format yet)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    with open(output_path, "w") as f:
        for item in validation_data:
            f.write(json.dumps(item, ensure_ascii=False) + "\n")
            
    print(f"✅ validation.jsonl built! Total examples randomly extracted: {total_extracted} / 300.")

if __name__ == "__main__":
    run()
