import { COMPANY_INFO } from "./companyInfo.js";

export const JAPAN_TRANSACTIONS_CONTENT = {
  slug: "legal/japan-transactions",
  title: "特定商取引法に基づく表記",
  eyebrow: "特定商取引法",
  effectiveDate: COMPANY_INFO.effectiveDate,
  description: "特定商取引法に基づき、販売事業者に関する情報および取引条件を表示します。",
  sections: [
    {
      id: "jt-seller",
      title: "販売事業者",
      blocks: [
        {
          type: "ul",
          items: [
            `販売業者名：${COMPANY_INFO.operatorName}（${COMPANY_INFO.operatorNameKo}）`,
            `代表者：${COMPANY_INFO.representativeName}`,
            `所在地：335, Geumgang-ro 125beon-gil, Geumjeong-gu, Busan, Republic of Korea`,
            `電話番号：${COMPANY_INFO.phone}（受付時間：平日 10:00〜18:00 KST）`,
            `メールアドレス：${COMPANY_INFO.publicContactEmail}`,
          ],
        },
      ],
    },
    {
      id: "jt-price",
      title: "販売価格",
      blocks: [
        {
          type: "ul",
          items: [
            "Freeプラン：無料",
            "Proプラン：¥980 / 月（税込）",
            "Familyプラン：¥1,980 / 月（税込）",
          ],
        },
        {
          type: "p",
          text: "表示価格はすべて消費税込みです。",
        },
      ],
    },
    {
      id: "jt-payment",
      title: "支払方法・支払時期",
      blocks: [
        {
          type: "ul",
          items: [
            "支払方法：クレジットカード（Visa、Mastercard、JCB など）、Google Pay",
            "支払時期：ご購入手続き完了時に即時決済されます。月次更新の場合は、各更新日に自動的に課金されます。",
          ],
        },
      ],
    },
    {
      id: "jt-service",
      title: "役務の提供時期",
      blocks: [
        {
          type: "p",
          text: "決済完了後、直ちにサービスをご利用いただけます。",
        },
      ],
    },
    {
      id: "jt-autorenewal",
      title: "自動更新について",
      blocks: [
        {
          type: "p",
          text: "本サービスのProプランおよびFamilyプランは月次自動更新のサブスクリプションです。解約手続きを行わない限り、毎月の更新日に自動的に課金されます。",
        },
        {
          type: "ul",
          items: [
            "更新日：最初の購入日から1ヶ月ごと",
            "解約方法：アプリ内「設定」→「プラン管理」→「解約する」からいつでも解約できます。または hestra.co@gmail.com までご連絡ください。",
            "解約タイミング：解約手続きは次回更新日の24時間前までに完了してください。",
            "解約後の取り扱い：解約後も当該期間の残り期間はサービスをご利用いただけます。日割り返金は行っておりません。",
          ],
        },
      ],
    },
    {
      id: "jt-refund",
      title: "返品・キャンセルについて",
      blocks: [
        {
          type: "p",
          text: "デジタルコンテンツの性質上、購入・更新後の返金は原則として承っておりません。ただし、システム障害など弊社の責に帰すべき事由によりサービスをご利用いただけなかった場合は、個別にご対応いたします。お問い合わせは hestra.co@gmail.com までご連絡ください。",
        },
      ],
    },
    {
      id: "jt-environment",
      title: "動作環境",
      blocks: [
        {
          type: "ul",
          items: [
            "Webブラウザ：Chrome、Safari、Edge、Firefox の最新版",
            "スマートフォン：Android 8.0 以上（Google Playアプリ）",
          ],
        },
      ],
    },
    {
      id: "jt-contact",
      title: "お問い合わせ",
      blocks: [
        {
          type: "p",
          text: `ご不明な点がございましたら、${COMPANY_INFO.publicContactEmail} までお気軽にお問い合わせください。`,
        },
      ],
    },
  ],
};
