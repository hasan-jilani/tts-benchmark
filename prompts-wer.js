/**
 * WER benchmark prompts — 80 prompts curated for pronunciation accuracy testing.
 * Pulled from existing wer_test_samples.csv with known differentiation patterns.
 * Heavy on alphanumeric/structured data where Deepgram has strongest advantage.
 *
 * Categories:
 *   baseline (15) — easy content, expect all providers tie
 *   alphanumeric (30) — order IDs, tracking numbers, serial codes, VINs, confirmation codes
 *   synthetic (20) — addresses, currency, dates
 *   mixed (15) — conversational with embedded structured data
 */
module.exports = [

  // === BASELINE (15) — easy, everyone should tie ===
  // Customer service
  { id: 1, category: 'baseline', subcategory: 'customer-service', text: "I'm so sorry for the inconvenience this has caused you." },
  { id: 2, category: 'baseline', subcategory: 'customer-service', text: "I'd be happy to help you with that." },
  { id: 3, category: 'baseline', subcategory: 'customer-service', text: "Let me transfer you to our technical support team... they'll be able to walk you through the setup process step by step." },
  { id: 4, category: 'baseline', subcategory: 'customer-service', text: "Is there anything else I can help you with today?" },
  { id: 5, category: 'baseline', subcategory: 'customer-service', text: "Your refund has been processed." },
  // Agent conversational
  { id: 6, category: 'baseline', subcategory: 'agent', text: "Please arrive 10 minutes early and bring your insurance card and a photo ID." },
  { id: 7, category: 'baseline', subcategory: 'agent', text: "I noticed you haven't logged in since January 15th - is there anything we can help you with?" },
  { id: 8, category: 'baseline', subcategory: 'agent', text: "Have you taken any medications today? Please include prescription drugs and over-the-counter items." },
  { id: 9, category: 'baseline', subcategory: 'agent', text: "Your symptoms sound manageable, but I'd recommend seeing Dr. Martinez within 48 hours to be safe." },
  { id: 10, category: 'baseline', subcategory: 'agent', text: "IT ticket about your printer issue has been assigned to technician Lisa Chen." },
  // IVR simple
  { id: 11, category: 'baseline', subcategory: 'ivr', text: "Press 1 for account balance, press 2 for recent transactions, or press 3 to speak with a representative." },
  { id: 12, category: 'baseline', subcategory: 'ivr', text: "I'm sorry, I didn't understand your response. Please say yes or no." },
  { id: 13, category: 'baseline', subcategory: 'ivr', text: "Please hold while we connect you to the next available agent. Your estimated wait time is 3 minutes." },
  { id: 14, category: 'baseline', subcategory: 'ivr', text: "Thank you for calling ABC Bank. This call may be recorded for quality assurance purposes." },
  { id: 15, category: 'baseline', subcategory: 'ivr', text: "To repeat this menu, press star. To return to the main menu, press 0." },

  // === ALPHANUMERIC (30) — the differentiator ===
  // Order IDs
  { id: 16, category: 'alphanumeric', subcategory: 'order-id', text: "Your order number is ORD-7X9K2B4M." },
  { id: 17, category: 'alphanumeric', subcategory: 'order-id', text: "I found your order: INV-2024-ABC789." },
  { id: 18, category: 'alphanumeric', subcategory: 'order-id', text: "Reference number PO-K3M8N2X1 has been updated." },
  // Confirmation codes
  { id: 19, category: 'alphanumeric', subcategory: 'confirmation', text: "Your confirmation code is A7B2C9." },
  { id: 20, category: 'alphanumeric', subcategory: 'confirmation', text: "Please note your booking reference: X4Y7Z2." },
  { id: 21, category: 'alphanumeric', subcategory: 'confirmation', text: "Your confirmation code is AJI0Y6." },
  { id: 22, category: 'alphanumeric', subcategory: 'confirmation', text: "Your confirmation code is NMMJBQ." },
  { id: 23, category: 'alphanumeric', subcategory: 'confirmation', text: "Please write down your confirmation number: PVS7HZ." },
  { id: 24, category: 'alphanumeric', subcategory: 'confirmation', text: "Your reservation code is DRC11E. That's D R C 1 1 E for clarity." },
  // Tracking numbers
  { id: 25, category: 'alphanumeric', subcategory: 'tracking', text: "Your UPS tracking number is 1Z999AA10123456784." },
  { id: 26, category: 'alphanumeric', subcategory: 'tracking', text: "Track your FedEx package with 794644790301." },
  { id: 27, category: 'alphanumeric', subcategory: 'tracking', text: "USPS tracking: 9400111899223033005088." },
  { id: 28, category: 'alphanumeric', subcategory: 'tracking', text: "Track your package with USPS using 5699767363842005507000." },
  // Serial numbers
  { id: 29, category: 'alphanumeric', subcategory: 'serial', text: "The product serial number is SN-A1B2C3D4E5." },
  { id: 30, category: 'alphanumeric', subcategory: 'serial', text: "Device serial: XK7M9P2N4L." },
  { id: 31, category: 'alphanumeric', subcategory: 'serial', text: "For warranty purposes, note the serial: XO6QJIUJV6." },
  { id: 32, category: 'alphanumeric', subcategory: 'serial', text: "The serial number is 23GDPPQ0Y9." },
  // VINs
  { id: 33, category: 'alphanumeric', subcategory: 'vin', text: "The VIN is 1HGBH41JXMN109186." },
  { id: 34, category: 'alphanumeric', subcategory: 'vin', text: "Vehicle identification: WBA3A5C51CF256789." },
  { id: 35, category: 'alphanumeric', subcategory: 'vin', text: "The VIN is BDHWV00PRK52FPKH2." },
  { id: 36, category: 'alphanumeric', subcategory: 'vin', text: "I'm looking up VIN CKX6MGCY2955NR4FM in our system." },
  { id: 37, category: 'alphanumeric', subcategory: 'vin', text: "The VIN is Z12YTGHB1CLBS7UBT." },
  // References / tickets
  { id: 38, category: 'alphanumeric', subcategory: 'reference', text: "Your case reference is REF-2024-XK7M9P." },
  { id: 39, category: 'alphanumeric', subcategory: 'reference', text: "Ticket ID: TKT-A2B4C6D8." },
  { id: 40, category: 'alphanumeric', subcategory: 'reference', text: "Support case CS-2024-M7N9P2 has been created." },
  { id: 41, category: 'alphanumeric', subcategory: 'reference', text: "I'm looking up order TKT-KX7EED now." },
  { id: 42, category: 'alphanumeric', subcategory: 'reference', text: "Please use reference REF-2024-9ER14F for follow-up." },
  // License plates
  { id: 43, category: 'alphanumeric', subcategory: 'plate', text: "The license plate is ABC 1234." },
  { id: 44, category: 'alphanumeric', subcategory: 'plate', text: "I have the vehicle registered as 5ACT244." },
  { id: 45, category: 'alphanumeric', subcategory: 'plate', text: "Can you confirm the plate number WJ-1876?" },

  // === SYNTHETIC (20) — structured data in natural formats ===
  // Currency
  { id: 46, category: 'synthetic', subcategory: 'currency', text: "Your balance is $320,540.54." },
  { id: 47, category: 'synthetic', subcategory: 'currency', text: "The price is $124,188.33." },
  { id: 48, category: 'synthetic', subcategory: 'currency', text: "Your refund of $5,143.11 will arrive shortly." },
  { id: 49, category: 'synthetic', subcategory: 'currency', text: "I paid $8,223.30 for that item." },
  { id: 50, category: 'synthetic', subcategory: 'currency', text: "The price is $96.24." },
  // Addresses
  { id: 51, category: 'synthetic', subcategory: 'address', text: "You can find us at 4463 Pine Boulevard, Ashland, New York 93130." },
  { id: 52, category: 'synthetic', subcategory: 'address', text: "I live at 2648 Adams Way, Marion, Michigan 11267." },
  { id: 53, category: 'synthetic', subcategory: 'address', text: "The delivery should arrive at 6268 Mill Street, Hudson, New York 36158 by noon." },
  { id: 54, category: 'synthetic', subcategory: 'address', text: "Mail the documents to 7042 Elm Street, Oxford, Pennsylvania 15229." },
  { id: 55, category: 'synthetic', subcategory: 'address', text: "I have your address as 1247 Oak Street, Apartment 3B, Springfield, Illinois, 62701. Is that correct?" },
  // Dates/times
  { id: 56, category: 'synthetic', subcategory: 'date', text: "The deadline is 14 July 2024." },
  { id: 57, category: 'synthetic', subcategory: 'date', text: "The meeting is on 30 October 2022 at 2:30 AM." },
  { id: 58, category: 'synthetic', subcategory: 'date', text: "Your appointment is scheduled for June 01, 2021 at 8:42 AM." },
  { id: 59, category: 'synthetic', subcategory: 'date', text: "The deadline is 11/15/2022." },
  { id: 60, category: 'synthetic', subcategory: 'date', text: "Your appointment is scheduled for 28 June 2026 at 1:59 PM." },
  // Numbers/percentages
  { id: 61, category: 'synthetic', subcategory: 'number', text: "Analysis shows 43,753 items." },
  { id: 62, category: 'synthetic', subcategory: 'number', text: "We achieved 37.91% completion." },
  { id: 63, category: 'synthetic', subcategory: 'number', text: "Performance improved by 28.38%." },
  { id: 64, category: 'synthetic', subcategory: 'number', text: "Your current balance is $2,847.63." },
  { id: 65, category: 'synthetic', subcategory: 'number', text: "Your account number is 4479218503." },

  // === MIXED (15) — conversational with embedded structured data ===
  { id: 66, category: 'mixed', subcategory: 'order+tracking', text: "Your order #ORD-24589 shipped via UPS tracking 1Z999AA1234567890 and will arrive between 2:30 PM - 4:45 PM tomorrow." },
  { id: 67, category: 'mixed', subcategory: 'order+tracking', text: "Order ORD-X7K9 ships via UPS 1Z999AA1234567890, confirmation A2B4C6." },
  { id: 68, category: 'mixed', subcategory: 'serial+model', text: "Serial SN-K7M9P2X4, model MDL-2024-A." },
  { id: 69, category: 'mixed', subcategory: 'account+ref', text: "Account A7X9-B2K4-M8N2 with reference REF-2024-P7Q9." },
  { id: 70, category: 'mixed', subcategory: 'billing', text: "Your invoice shows a balance of $187.50, including the monthly fee plus tax." },
  { id: 71, category: 'mixed', subcategory: 'billing', text: "The $24.99 charge is for the premium support package you activated on January 22nd." },
  { id: 72, category: 'mixed', subcategory: 'billing', text: "Your auto-payment of $67.50 failed due to an expired card - would you like to update your payment method?" },
  { id: 73, category: 'mixed', subcategory: 'banking', text: "Your wire transfer of $1,247.50 to account ending in 5691 was processed at 2:15 PM." },
  { id: 74, category: 'mixed', subcategory: 'subscription', text: "Hi David, your premium subscription renews in 5 days at $29.99 - would you like to continue or explore other options?" },
  { id: 75, category: 'mixed', subcategory: 'sales', text: "For a 50-person team, I'd recommend our Business plan at $149 per month rather than Basic." },
  { id: 76, category: 'mixed', subcategory: 'sales', text: "Great timing! We're offering 20% off annual plans - that saves you $359.88 for the first year." },
  { id: 77, category: 'mixed', subcategory: 'security', text: "For security, please confirm the last 4 digits of the card ending in 8429 used for your recent purchase." },
  { id: 78, category: 'mixed', subcategory: 'security', text: "We detected 2 unusual login attempts from Chicago, Illinois yesterday around 11:30 PM." },
  { id: 79, category: 'mixed', subcategory: 'tech', text: "Your device is downloading update version 12.4.1 - about 250 MB remaining, roughly 8 minutes left." },
  { id: 80, category: 'mixed', subcategory: 'tech', text: "I'm seeing error code E-1047 here, which usually means - actually, let me guide you through the solution." },
];
