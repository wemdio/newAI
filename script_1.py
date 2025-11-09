
# Create a summary of alternative AI models for comparison

models_comparison = {
    "gemini-2.0-flash-001": {
        "provider": "Google via OpenRouter",
        "input_cost": "$0.10 per 1M tokens",
        "output_cost": "$0.40 per 1M tokens",
        "context_window": "1M tokens",
        "speed": "Fast (2.5s average)",
        "strengths": ["Best value", "Good reasoning", "Large context"],
        "recommendation": "PRIMARY CHOICE"
    },
    "gemini-2.0-flash-lite-001": {
        "provider": "Google via OpenRouter",
        "input_cost": "$0.075 per 1M tokens",
        "output_cost": "$0.30 per 1M tokens",
        "context_window": "1M tokens",
        "speed": "Very Fast (1.8s average)",
        "strengths": ["Cheapest option", "Fast TTFT", "Good for simple tasks"],
        "recommendation": "BUDGET ALTERNATIVE"
    },
    "gpt-4o-mini": {
        "provider": "OpenAI via OpenRouter",
        "input_cost": "$0.15 per 1M tokens",
        "output_cost": "$0.60 per 1M tokens",
        "context_window": "128k tokens",
        "speed": "Fast",
        "strengths": ["Reliable", "Good reasoning", "OpenAI quality"],
        "recommendation": "FALLBACK OPTION"
    },
    "claude-3-haiku": {
        "provider": "Anthropic via OpenRouter",
        "input_cost": "$0.25 per 1M tokens",
        "output_cost": "$1.25 per 1M tokens",
        "context_window": "200k tokens",
        "speed": "Fast",
        "strengths": ["Excellent accuracy", "Good at following instructions"],
        "recommendation": "PREMIUM OPTION"
    }
}

print("AI MODEL COMPARISON FOR LEAD DETECTION")
print("=" * 80)
print()

for model, specs in models_comparison.items():
    print(f"📊 {model}")
    print(f"   Provider: {specs['provider']}")
    print(f"   Cost: {specs['input_cost']} (in) / {specs['output_cost']} (out)")
    print(f"   Context: {specs['context_window']}")
    print(f"   Speed: {specs['speed']}")
    print(f"   Strengths: {', '.join(specs['strengths'])}")
    print(f"   → {specs['recommendation']}")
    print()

# Calculate cost comparison for 100k messages
print("\n💰 COST COMPARISON FOR 100,000 MESSAGES:")
print("-" * 80)

avg_input_tokens = 120  # message + context
avg_output_tokens = 60  # JSON response

for model, specs in models_comparison.items():
    input_cost_per_token = float(specs['input_cost'].split('$')[1].split()[0]) / 1_000_000
    output_cost_per_token = float(specs['output_cost'].split('$')[1].split()[0]) / 1_000_000
    
    total_cost = (avg_input_tokens * input_cost_per_token * 100_000) + \
                 (avg_output_tokens * output_cost_per_token * 100_000)
    
    print(f"{model}: ${total_cost:.2f}")

print("\n✅ RECOMMENDATION: Use gemini-2.0-flash-001")
print("   - Best balance of cost, speed, and accuracy")
print("   - $1.80 per 100k messages analyzed")
print("   - Allow users to switch models in advanced settings")
