# Knowledge packs

What GigaLibs' agents know, written down. The organisation and its rules are in
[.pi/org/ORGANIZATION.md](../../.pi/org/ORGANIZATION.md) §5.

## Layout

```
docs/knowledge/
  modules/<module>/PACK.md       kept by the module lead (the module brief)
  industries/<sector>/PACK.md    kept by the industry lead (the sector and its solution blueprint)
  specialists/<area>/PACK.md     kept by the specialist; country packs as specialists/tax/<country>/PACK.md
  design/PACK.md                 kept by the design lead: principles, ergonomics, design system, accessibility
  _template/PACK.md              the structure every pack follows
```

## Rules

1. **Every fact cites a source:** a law or standard (with its edition or date), a product's published documentation
   (with the page and date read), a customer document (with the customer's permission), or an open-source file (with
   its path). A section with no researched content says **"Not yet researched"**.
2. **Our own words.** Learn rules, processes and calculations; never copy code, text, screens or proprietary
   content. iDempiere is GPL v2; copying its code would place GPL obligations on GigaLibs. The licence and IP reviewer
   checks packs.
3. **Human validation** for tax, accounting and regulated sectors (pharma, healthcare, food): a named expert signs
   the pack's "Validated by" line before code depends on it.
4. **Packs change through cards,** like code. Each change records who changed it and why.
5. **Confidential customer material** is not stored here unless the customer agrees. Summarise it without names, or
   keep it outside the repository.
