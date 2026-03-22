/**
 * Test prompts for TTS benchmarking.
 * Mix of short/medium/long, conversational/structured/enterprise content.
 * Same prompts run against every provider for apples-to-apples comparison.
 */
module.exports = [
  // --- Short conversational ---
  { id: 1, category: 'conversational-short', text: "Hi there! How can I help you today?" },
  { id: 2, category: 'conversational-short', text: "Sure, let me look that up for you right now." },
  { id: 3, category: 'conversational-short', text: "Is there anything else I can help you with?" },

  // --- Medium conversational ---
  { id: 4, category: 'conversational-medium', text: "I completely understand your frustration. We've had a few customers experience this same problem today, but I have a solution that should work perfectly for your situation." },
  { id: 5, category: 'conversational-medium', text: "Let me transfer you to our technical support team. They'll be able to walk you through the setup process step by step." },
  { id: 6, category: 'conversational-medium', text: "Thanks for your patience while I pulled up your account. I can see the issue now, and I'm going to get this resolved for you right away." },

  // --- Long conversational ---
  { id: 7, category: 'conversational-long', text: "I appreciate you calling in about this. I've reviewed your account history and I can see that the charge was applied incorrectly on March 3rd. What I'm going to do is issue a full refund to your original payment method, and that should appear in your account within three to five business days. In the meantime, I've also applied a courtesy credit to your account for the inconvenience." },
  { id: 8, category: 'conversational-long', text: "Welcome to Acme customer support. Before we get started, I want to let you know that this call may be recorded for quality assurance purposes. I'm here to help you with any questions about your account, billing, technical issues, or anything else you might need assistance with. What can I help you with today?" },

  // --- Customer service ---
  { id: 9, category: 'customer-service', text: "I'm so sorry for the inconvenience this has caused you." },
  { id: 10, category: 'customer-service', text: "Your refund of $147.99 has been processed and should appear in your account within 3 to 5 business days." },
  { id: 11, category: 'customer-service', text: "I've updated your shipping address. Your package is now scheduled for delivery on Thursday, March 20th." },

  // --- IVR ---
  { id: 12, category: 'ivr', text: "Please hold while we connect you to the next available agent. Your estimated wait time is 3 minutes." },
  { id: 13, category: 'ivr', text: "For billing inquiries, press 1. For technical support, press 2. For all other questions, press 3." },
  { id: 14, category: 'ivr', text: "Your current balance is $2,847.63. To make a payment, press 1." },

  // --- Alphanumeric / structured data ---
  { id: 15, category: 'alphanumeric', text: "I found your order: INV-2024-ABC789." },
  { id: 16, category: 'alphanumeric', text: "Your USPS tracking number is 9400111899223033005088." },
  { id: 17, category: 'alphanumeric', text: "The serial number is SN-K7M9P2X4, model MDL-2024-A." },
  { id: 18, category: 'alphanumeric', text: "Your case reference is REF-2024-XK7M9P." },
  { id: 19, category: 'alphanumeric', text: "Your confirmation code is AJI0Y6." },
  { id: 20, category: 'alphanumeric', text: "The VIN is BDHWV00PRK52FPKH2." },

  // --- Mixed (conversational + structured) ---
  { id: 21, category: 'mixed', text: "I'm looking up order REF-02DGTF now. It looks like it shipped on March 12th via FedEx, tracking number 7489 3294 0011 2233." },
  { id: 22, category: 'mixed', text: "I have your address as 1247 Oak Street, Apartment 3B, Springfield, Illinois, 62701. Is that correct?" },
  { id: 23, category: 'mixed', text: "Your account number is 4821-7734-0092. Your next payment of $320.54 is due on April 1st." },

  // --- Casual chat ---
  { id: 24, category: 'casual', text: "Ha, yeah, that's a great question actually. Let me think about that for a second." },
  { id: 25, category: 'casual', text: "Oh totally, I've seen that happen before. The trick is to restart the app and then clear your cache. Works every time." },
];
