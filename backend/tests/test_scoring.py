from app.scoring import (
    compute_recommendation_data,
    compute_summary_for_models,
)


def test_dominated_model_not_on_frontier() -> None:
    summaries = [
        {
            "model": "model_a",
            "provider": "ollama",
            "quality": 85.0,
            "tps": 30.0,
            "total_ms": 500.0,
            "mem_gb": 4.0,
            "failed": False,
        },
        {
            "model": "model_dominated",
            "provider": "ollama",
            "quality": 80.0,
            "tps": 20.0,
            "total_ms": 700.0,
            "mem_gb": 5.0,
            "failed": False,
        },
        {
            "model": "model_efficient",
            "provider": "ollama",
            "quality": 75.0,
            "tps": 50.0,
            "total_ms": 300.0,
            "mem_gb": 2.0,
            "failed": False,
        },
    ]
    res = compute_recommendation_data(summaries, axis="memory")
    assert "model_dominated" not in res["frontier"]
    assert "model_a" in res["frontier"]
    assert "model_efficient" in res["frontier"]


def test_threshold_one_selects_top_quality() -> None:
    summaries = [
        {
            "model": "top_model",
            "provider": "ollama",
            "quality": 90.0,
            "tps": 25.0,
            "total_ms": 600.0,
            "mem_gb": 8.0,
            "failed": False,
        },
        {
            "model": "small_model",
            "provider": "ollama",
            "quality": 70.0,
            "tps": 40.0,
            "total_ms": 300.0,
            "mem_gb": 2.0,
            "failed": False,
        },
    ]
    res = compute_recommendation_data(summaries, threshold=1.0)
    assert res["good_enough"]["model"] == "top_model"


def test_zero_weights_uses_equal_weights() -> None:
    summaries = [
        {
            "model": "m1",
            "provider": "ollama",
            "quality": 80.0,
            "tps": 30.0,
            "total_ms": 400.0,
            "mem_gb": 4.0,
            "failed": False,
        },
        {
            "model": "m2",
            "provider": "ollama",
            "quality": 70.0,
            "tps": 50.0,
            "total_ms": 200.0,
            "mem_gb": 2.0,
            "failed": False,
        },
    ]
    res = compute_recommendation_data(
        summaries, quality_w=0, speed_w=0, memory_w=0
    )
    assert len(res["ranking"]) == 2
    for r in res["ranking"]:
        assert r["score"] > 0


def test_normalisation_all_equal() -> None:
    summaries = [
        {
            "model": "m1",
            "provider": "ollama",
            "quality": 80.0,
            "tps": 30.0,
            "total_ms": 400.0,
            "mem_gb": 4.0,
            "failed": False,
        },
        {
            "model": "m2",
            "provider": "ollama",
            "quality": 80.0,
            "tps": 30.0,
            "total_ms": 400.0,
            "mem_gb": 4.0,
            "failed": False,
        },
    ]
    res = compute_recommendation_data(summaries)
    assert res["ranking"][0]["score"] == res["ranking"][1]["score"]


def test_bootstrap_identical_on_two_calls() -> None:
    stats = [{"model": "m1", "provider": "ollama", "size_gb": 4.0, "vram_gb": 4.0}]
    resps = [
        {"id": 1, "model": "m1", "tps": 30.0, "ttft_ms": 100.0, "total_ms": 400.0},
        {"id": 2, "model": "m1", "tps": 32.0, "ttft_ms": 110.0, "total_ms": 410.0},
        {"id": 3, "model": "m1", "tps": 28.0, "ttft_ms": 90.0, "total_ms": 390.0},
    ]
    scores = [
        {"response_id": 1, "overall": 8},
        {"response_id": 2, "overall": 9},
        {"response_id": 3, "overall": 7},
    ]
    sum1 = compute_summary_for_models(stats, resps, scores, 3)
    sum2 = compute_summary_for_models(stats, resps, scores, 3)
    assert sum1[0]["quality_ci"] == sum2[0]["quality_ci"]
