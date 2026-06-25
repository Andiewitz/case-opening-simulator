# CS2 Unboxed

A polished, fully-featured Counter-Strike 2 (CS2) case opening simulator built with React, Tailwind CSS, and Firebase.

## Features

- 🎰 **Immersive Case Opening:** A fluid, animated scrolling reel with dynamic visual effects, sound cues, and a tension-building slowdown revealing the dropped item.
- 📊 **Realistic Probabilities:** Simulates accurate drop rates mimicking genuine CS2 dynamics, ranging from Mil-Spec (Blue) to Covert (Red) and Gold (Rare Special Items).
- 💎 **Advanced Item Simulation:**
  - **Floats & Conditions:** Rolls accurate float values (0.00 to 1.00) determining condition from Factory New to Battle-Scarred.
  - **Patterns & Blue Gems:** Rolls pattern seeds from 1 to 1000. Includes an advanced economy mechanic specifically for Case Hardened variants where Tier 1 and Tier 2 "Blue Gems" receive massive value multipliers.
  - **Doppler Phases:** Simulates weapon finishes like Emerald, Sapphire, Ruby, and Black Pearl with correlated pricing boosts.
  - **StatTrak™:** 10% chance to drop StatTrak™ weapons for additional value.
- 📦 **Live Inventory System:** Real-time synchronization of your inventory, balance, and stats using Firebase Firestore and authenticated user accounts (Google Auth).
- 💰 **Economy & Selling:** Instantly sell individual items or your entire inventory to fund more case unboxings. Calculates prices dynamically based on the exact rolled float, pattern, phase, and overall rarity.
- 🔊 **Sound Design:** Built-in Web Audio API integration for satisfying unboxing ticks, rarity-based revelation chords, and cash-out sounds.

## Tech Stack

- **Frontend:** React, TypeScript, Tailwind CSS, Lucide Icons, Framer Motion (Implicit/Transitions).
- **Backend/DB:** Firebase Authentication, Firestore (with strictly enforced Attribute-Based Access Control security rules).
- **Audio:** Native Web `AudioContext`.

## Getting Started

To run this application locally, you will need a Firebase project set up. 

1. Ensure the Google authentication provider is enabled in your Firebase console.
2. Initialize Firestore.
3. Deploy the provided `firestore.rules` using the Firebase CLI or manually via the console to secure the database paths (inventory records and user balances).
4. Run `npm install` and `npm run dev` to boot the application.
