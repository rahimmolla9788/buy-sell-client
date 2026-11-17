/**
 * 💳 পেমেন্ট ইনপুট ভ্যালিডেশন কনফিগারেশন (Payment Input Validation Config)
 * 
 * এই ফাইল থেকে আপনি পেমেন্ট করার সময়:
 * ১. অ্যাকাউন্ট নম্বরের দৈর্ঘ্য (Account Number Length)
 * ২. ওটিপির দৈর্ঘ্য (OTP Length)
 * ৩. পাসওয়ার্ড / পিন এর সর্বনিম্ন ও সর্বোচ্চ দৈর্ঘ্য (PIN/Password Min & Max Length)
 * খুব সহজেই আপনার প্রয়োজন অনুযায়ী পরিবর্তন করতে পারবেন।
 */

export interface FieldLengthRule {
  /** সর্বনিম্ন দৈর্ঘ্য (Minimum Length) */
  minLength: number;
  /** সর্বোচ্চ দৈর্ঘ্য (Maximum Length) */
  maxLength: number;
  /** নির্দিষ্ট ফিক্সড দৈর্ঘ্য (যদি ঠিক এই দৈর্ঘ্যের হতে হয়, যেমন ১১ ডিজিট) */
  exactLength?: number;
}

export interface PaymentValidationConfig {
  /** ১. অ্যাকাউন্ট নম্বরের ভ্যালিডেশন (যেমন: ১১ ডিজিট) */
  accountNumber: FieldLengthRule;
  /** ২. ওটিপির ভ্যালিডেশন (যেমন: ৪ থেকে ৬ ডিজিট অথবা ফিক্সড ৬ ডিজিট) */
  otp: FieldLengthRule;
  /** ৩. পাসওয়ার্ড / পিন এর ভ্যালিডেশন (যেমন: সর্বনিম্ন ৪ ও সর্বোচ্চ ৬ ডিজিট) */
  pin: FieldLengthRule;
}

/**
 * ⚙️ মূল কনফিগারেশন (Default Payment Validation Config)
 * আপনার পছন্দ অনুযায়ী এখানে সংখ্যাগুলো পরিবর্তন করুন:
 */
export const PAYMENT_VALIDATION_CONFIG: PaymentValidationConfig = {
  // ১. অ্যাকাউন্ট নম্বর (Account Number)
  accountNumber: {
    minLength: 11,
    maxLength: 11,
    exactLength: 11, // ফিক্সড ১১ ডিজিট (01XXXXXXXXX)
  },

  // ২. ওটিপি কোড (OTP Code)
  otp: {
    minLength: 4,     // সর্বনিম্ন ৪ ডিজিট
    maxLength: 6,     // সর্বোচ্চ ৬ ডিজিট
    exactLength: 6,   // ফিক্সড ৬ ডিজিট চাইলে 6 রাখুন, অথবা ৪-৬ এলাউ করতে undefined রাখুন
  },

  // ৩. পাসওয়ার্ড / পিন (PIN / Password Min & Max Length)
  pin: {
    minLength: 4,     // সর্বনিম্ন দৈর্ঘ্য (যেমন ৪)
    maxLength: 6,     // সর্বোচ্চ দৈর্ঘ্য (যেমন ৬)
    // exactLength: 5, // যদি কোনো নির্দিষ্ট ফিক্সড দৈর্ঘ্য চান তবে সংখ্যা দিন, অন্যথায় আনকমেন্ট করবেন না
  },
};

/**
 * 🔍 মেথড অনুযায়ী আলাদা কাস্টমাইজেশন (ঐচ্ছিক):
 * যদি বিকাশ, নগদ ও রকেটের জন্য আলাদা রুলস ব্যবহার করতে চান তবে নিচে সক্রিয় করতে পারেন।
 */
export const METHOD_SPECIFIC_RULES: Record<string, Partial<PaymentValidationConfig>> = {
  bkash: {
    // বিকাশ: ১১ ডিজিট নম্বর, ৬ ডিজিট ওটিপি, ৫ ডিজিট পিন
    pin: { minLength: 5, maxLength: 5, exactLength: 5 },
  },
  nagad: {
    // নগদ: ১১ ডিজিট নম্বর, ৪ বা ৬ ডিজিট ওটিপি, ৪ ডিজিট পিন
    pin: { minLength: 4, maxLength: 4, exactLength: 4 },
  },
  rocket: {
    // রকেট: ১১ বা ১২ ডিজিট নম্বর, ৪ ডিজিট পিন
    accountNumber: { minLength: 11, maxLength: 12 },
    pin: { minLength: 4, maxLength: 4, exactLength: 4 },
  },
};

/**
 * পেমেন্ট মেথড অনুযায়ী সক্রিয় ভ্যালিডেশন কনফিগারেশন পাওয়ার হেল্পার ফাংশন
 * @param method 'bkash' | 'nagad' | 'rocket' ইত্যাদি
 * @param useMethodSpecific যদি মেথড অনুযায়ী আলাদা রুলস কার্যকর করতে চান (ডিফল্ট: false)
 */
export function getPaymentValidationConfig(
  method?: string,
  useMethodSpecific: boolean = false
): PaymentValidationConfig {
  const base: PaymentValidationConfig = {
    accountNumber: { ...PAYMENT_VALIDATION_CONFIG.accountNumber },
    otp: { ...PAYMENT_VALIDATION_CONFIG.otp },
    pin: { ...PAYMENT_VALIDATION_CONFIG.pin },
  };

  if (!useMethodSpecific || !method) {
    return base;
  }

  const key = method.toLowerCase();
  const matchedKey = Object.keys(METHOD_SPECIFIC_RULES).find((m) => key.includes(m));
  if (matchedKey && METHOD_SPECIFIC_RULES[matchedKey]) {
    const override = METHOD_SPECIFIC_RULES[matchedKey]!;
    if (override.accountNumber) base.accountNumber = { ...base.accountNumber, ...override.accountNumber };
    if (override.otp) base.otp = { ...base.otp, ...override.otp };
    if (override.pin) base.pin = { ...base.pin, ...override.pin };
  }

  return base;
}

