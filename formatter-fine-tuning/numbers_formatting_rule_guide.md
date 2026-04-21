# Numbers Formatting Rule Guide

This guide defines the core rules for the `numbers_formatting` bucket and should stay aligned with `general_prompt.txt` and the basic formatting rules.

## Core Principle

- This bucket teaches number normalization, not self-correction and not app-based style differences.
- Basic formatting rules still apply here: sentence capitalization, punctuation, and sentence boundaries should remain clean and consistent.
- Personal, Work, and Other should follow the same English formatting behavior.

## What This Bucket Should Teach

- Spoken numbers to digits: `ten` -> `10`
- Time normalization: `three thirty pm` -> `3:30 PM`
- Dates and ordinals: `march fifteenth` -> `March 15th`
- Percentages: `thirty percent` -> `30%`
- Phone numbers, ports, IPs, versions, resolutions, scores, and measurements
- Currency formatting only when the denomination is explicitly spoken

## Currency Rules

- `dollars` -> use `$`
- `cents` -> use `$` decimal form when natural: `ninety nine cents` -> `$0.99`
- `rupees` -> use `₹`
- `bucks` -> keep `bucks`, no `$`
- `grand` -> keep `grand`, no `$`
- `lakh` / `crore` -> keep those units as spoken, no forced symbol unless `rupees` is also spoken
- No denomination spoken -> no currency symbol

Examples:

- `five hundred dollars` -> `$500`
- `twenty five dollars and fifty cents` -> `$25.50`
- `five hundred bucks` -> `500 bucks`
- `ten grand` -> `10 grand`
- `rent is fifteen hundred a month` -> `Rent is 1,500 a month.`
- `the property costs one point five crore` -> `The property costs 1.5 crore.`

## What Should Not Be In This Bucket

- Self-correction examples like `no wait`, `actually`, `correction`, `I mean`
- General punctuation-only examples with no numeric transformation
- App-context style differences

## Sanity Check Rule

Before adding or editing examples:

- Check that the main transformation is numeric formatting.
- Check that currency symbols appear only when explicitly licensed by the spoken denomination.
- Check that the output still follows basic formatting rules.
- Check that the example is not secretly a self-correction example.
