export const COMPANY_INFO = {
  serviceName: "Zeusian",
  operatorName: "Hestra",
  operatorNameKo: "헤스트라",
  representativeName: "김서진",
  businessRegistrationNumber: "393-03-03517",
  address: "부산광역시 금정구 금강로 335번길 125",
  phone: "010-5906-5692",
  privacyContactName: "김서진",
  publicContactEmail: "hestra.co@gmail.com",
  effectiveDate: "2026.03.17",
};

export const COMPANY_INFO_ITEMS = [
  { label: "상호", value: `${COMPANY_INFO.operatorNameKo} (${COMPANY_INFO.operatorName})` },
];

export const LEGAL_LINKS = [
  { href: "/terms", label: "이용약관" },
  { href: "/privacy", label: "개인정보처리방침" },
];
