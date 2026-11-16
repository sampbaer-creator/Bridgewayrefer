---
name: bridgeway-dashboard-design
description: Design and review BridgeWay Staff and Admin dashboards, referral inbox interactions, and NFC card setup.
---

# BridgeWay dashboard design

- Use Sneat for navigation, card hierarchy and settings layouts. Implement patterns in the existing React components and staff stylesheet.
- Use light blue for selection, white for cards and warm neutrals for the workspace background. Keep status text visible and use existing color tokens.
- Use AdminX as a reference for search and filters and Adminator for queue and detail layouts. Keep next action and deadline visible in the inbox. Preserve search and pagination when returning from a referral.
- Use SSO Referrals as the reference for the customer journey. Follow the card link through branded intake, contact consent and partner and location attribution.
- Show physical NFC and QR verification separately from the isolated synthetic referral. Use synthetic data for verification and keep normal reports free of test referrals.
- Review desktop and phone widths, keyboard navigation, empty and loading states, and workspace role boundaries. Run the web build and Playwright suite.
