# Launcher landscape notes — v0.25.0

Eternal Craft Launcher is intentionally **not** a general-purpose multi-instance launcher. SIEGE has one official pack, so the product prioritizes a safe one-click path for players and a controlled test/publish workflow for the maintainer.

Current general-purpose launchers already cover the basics very well: instance management, automatic Java, Modrinth/CurseForge browsing, modpack installs, screenshots and increasingly settings synchronization. Rebuilding all of that as generic functionality would add complexity without improving SIEGE.

The v0.25 direction instead concentrates on gaps that are particularly valuable to a managed server pack:

1. Explain a mod install *before* changing the instance: dependencies, download size, source and client/server compatibility.
2. Pin known-good personal mod versions instead of forcing every mod into bulk updates.
3. Keep a local change journal and correlate crashes with recent mod changes.
4. Quarantine suspected personal mods without touching official files.
5. Give players a selective, user-owned Personal Vault instead of requiring a launcher-specific cloud account.
6. Protect publishing with a source fingerprint so the reviewed preview and the published pack cannot silently diverge.
7. Preserve the simple player experience: one official SIEGE install, one Play button, automatic Java/resolution/GPU defaults and safe differential updates.

This document is a product-direction note rather than a claim that any launcher is universally "best". Different launchers optimize for different use cases.
