import type { Locale } from './alsvid-api';

// 账户中心全部文案。每条都必须是「三语齐全」的 Record<Locale,string>，
// 缺任何一语言在编译期即报错——与 lib/ui-text.ts 同一机制，杜绝运行时回退。
type Text = Record<Locale, string>;

// 后端返回的状态值来自数据库，可能是本文件未覆盖的新值。
// pick 保证任何情况下都有可读文案（回退德语），而不是渲染出 undefined。
export function pick(text: Text, locale: string): string {
  return (text as Record<string, string>)[locale] || text.de;
}

export function pickStatus(map: Record<string, Text>, value: string, locale: string): string {
  const entry = map[value];
  // 未收录的状态（例如数据库新增值）原样显示，便于第一时间发现问题而不是被吞掉。
  return entry ? pick(entry, locale) : value || '—';
}

export const NAV: Record<'overview' | 'orders' | 'vehicles' | 'service' | 'repairs' | 'security', Text> = {
  overview: { de: 'Übersicht', en: 'Overview', zh: '概览' },
  orders: { de: 'Bestellungen', en: 'Orders', zh: '我的订单' },
  vehicles: { de: 'Meine Fahrzeuge', en: 'My vehicles', zh: '我的车辆' },
  service: { de: 'Serviceanfragen', en: 'Service requests', zh: '服务申请' },
  repairs: { de: 'Servicehistorie', en: 'Service history', zh: '维修履历' },
  security: { de: 'Konto & Sicherheit', en: 'Account & security', zh: '账号与安全' },
};

export const COMMON = {
  loading: { de: 'Wird geladen…', en: 'Loading…', zh: '正在加载…' },
  retry: { de: 'Erneut versuchen', en: 'Try again', zh: '重试' },
  save: { de: 'Speichern', en: 'Save', zh: '保存' },
  submitting: { de: 'Wird gesendet…', en: 'Sending…', zh: '正在提交…' },
  cancel: { de: 'Abbrechen', en: 'Cancel', zh: '取消' },
  none: { de: 'Keine Einträge', en: 'Nothing here yet', zh: '暂无记录' },
  unknown: { de: 'Unbekannt', en: 'Unknown', zh: '未知' },
  optional: { de: 'optional', en: 'optional', zh: '选填' },
  required: { de: 'Pflichtfeld', en: 'Required', zh: '必填' },
  requestFailed: { de: 'Die Anfrage konnte nicht verarbeitet werden. Bitte erneut versuchen.', en: 'The request could not be completed. Please try again.', zh: '请求未能完成，请重试。' },
};

export const LOGIN = {
  eyebrow: { de: 'ALSVID / Kundenbereich', en: 'ALSVID / Owner area', zh: 'ALSVID / 车主中心' },
  title: { de: 'Anmelden', en: 'Sign in', zh: '登录' },
  lede: {
    de: 'Der Kundenbereich ist freigeschalteten ALSVID Kundenkonten vorbehalten.',
    en: 'The owner area is reserved for approved ALSVID customer accounts.',
    zh: '车主中心仅对已开通的 ALSVID 客户账号开放。',
  },
  username: { de: 'E-Mail oder Benutzername', en: 'Email or username', zh: '邮箱或用户名' },
  password: { de: 'Passwort', en: 'Password', zh: '密码' },
  submit: { de: 'Anmelden', en: 'Sign in', zh: '登录' },
  invalid: { de: 'E-Mail/Benutzername oder Passwort ist falsch.', en: 'Incorrect email/username or password.', zh: '账号或密码错误。' },
  rateLimited: { de: 'Zu viele Versuche. Bitte später erneut versuchen.', en: 'Too many attempts. Please try again later.', zh: '尝试次数过多，请稍后重试。' },
  notOwner: {
    de: 'Dieses Konto ist kein freigeschaltetes Kundenkonto. Bitte wenden Sie sich an ALSVID.',
    en: 'This account is not an approved customer account. Please contact ALSVID.',
    zh: '该账号不是已开通的车主账号，请联系 ALSVID。',
  },
  unavailable: { de: 'Die Anmeldung ist derzeit nicht verfügbar.', en: 'Sign-in is currently unavailable.', zh: '登录服务暂不可用。' },
  notice: {
    de: 'Hinweis: Bestellungen und Serviceanfragen sind unverbindliche Anfragen; Zahlungen erfolgen nicht über diese Seite.',
    en: 'Note: orders and service requests are non-binding requests; no payment is taken on this site.',
    zh: '说明：订单与服务申请均为不具约束力的申请，本站不进行任何付款。',
  },
};

export const OVERVIEW = {
  eyebrow: { de: 'ALSVID / Kundenbereich', en: 'ALSVID / Owner area', zh: 'ALSVID / 车主中心' },
  title: { de: 'Willkommen zurück', en: 'Welcome back', zh: '欢迎回来' },
  signedInAs: { de: 'Angemeldet als', en: 'Signed in as', zh: '当前账号' },
  logout: { de: 'Abmelden', en: 'Sign out', zh: '退出登录' },
  ordersHint: { de: 'Bestellanfragen, Angebote und Lieferungen', en: 'Order requests, quotes and deliveries', zh: '订购申请、报价与配送' },
  vehiclesHint: { de: 'Zugeordnete Fahrzeuge und Garantien', en: 'Assigned vehicles and warranties', zh: '已授权车辆与保修' },
  serviceHint: { de: 'Serviceanfrage stellen und Antworten verfolgen', en: 'Raise a service request and follow replies', zh: '提交服务申请并查看回复' },
  repairsHint: { de: 'Reparaturen, Kostenvoranschläge und Verlauf', en: 'Repairs, quotes and history', zh: '维修记录、报价与进度' },
  securityHint: { de: 'Passwort ändern und Sitzung beenden', en: 'Change password and end session', zh: '修改密码与结束会话' },
};

// 后端 storefront_orders.status 的真实取值
export const ORDER_STATUS: Record<string, Text> = {
  submitted: { de: 'Angefragt', en: 'Requested', zh: '已提交申请' },
  quoted: { de: 'Angebot liegt vor', en: 'Quote available', zh: '已报价待确认' },
  accepted: { de: 'Angenommen', en: 'Accepted', zh: '已接受' },
  allocated: { de: 'Reserviert', en: 'Reserved', zh: '已配货' },
  partially_paid: { de: 'Teilweise bezahlt', en: 'Partially paid', zh: '部分付款' },
  paid: { de: 'Bezahlt', en: 'Paid', zh: '已付款' },
  shipped: { de: 'Versandt', en: 'Shipped', zh: '已发货' },
  delivered: { de: 'Geliefert', en: 'Delivered', zh: '已签收' },
  cancelled: { de: 'Storniert', en: 'Cancelled', zh: '已取消' },
  declined: { de: 'Abgelehnt', en: 'Declined', zh: '已拒绝' },
};

// app_users.role 的真实取值
export const ROLE: Record<string, Text> = {
  owner: { de: 'Kunde', en: 'Customer', zh: '车主' },
  dealer: { de: 'Händler', en: 'Dealer', zh: '经销商' },
  supplier: { de: 'Lieferant', en: 'Supplier', zh: '供应商' },
  admin: { de: 'Administrator', en: 'Administrator', zh: '管理员' },
  viewer: { de: 'Lesezugriff', en: 'Read-only', zh: '只读账号' },
};

export const RETURN_STATUS: Record<string, Text> = {  pending: { de: 'Rücksendung angefragt', en: 'Return requested', zh: '退货申请中' },
  approved: { de: 'Rücksendung genehmigt', en: 'Return approved', zh: '退货已批准' },
  rejected: { de: 'Rücksendung abgelehnt', en: 'Return rejected', zh: '退货已拒绝' },
};

export const ORDERS = {
  eyebrow: { de: 'ALSVID / Bestellungen', en: 'ALSVID / Orders', zh: 'ALSVID / 我的订单' },
  title: { de: 'Bestellungen', en: 'Orders', zh: '我的订单' },
  lede: {
    de: 'Alle Bestellanfragen mit Angebot, Lieferung und Rücksendungen.',
    en: 'Every order request with quote, delivery and returns.',
    zh: '全部订购申请，含报价、配送与退货。',
  },
  empty: { de: 'Sie haben noch keine Bestellanfrage gestellt.', en: 'You have not submitted an order request yet.', zh: '您还没有提交过订购申请。' },
  browse: { de: 'E-Bikes ansehen', en: 'Explore E-Bikes', zh: '浏览整车' },
  loadMore: { de: 'Weitere laden', en: 'Load more', zh: '加载更多' },
  createdAt: { de: 'Angefragt am', en: 'Requested on', zh: '申请时间' },
  items: { de: 'Positionen', en: 'Items', zh: '商品明细' },
  subtotal: { de: 'Zwischensumme', en: 'Items subtotal', zh: '商品小计' },
  paid: { de: 'Bezahlt', en: 'Paid', zh: '已付款' },
  refunded: { de: 'Erstattet', en: 'Refunded', zh: '已退款' },
  quote: { de: 'Angebot', en: 'Quote', zh: '报价单' },
  quoteTotal: { de: 'Gesamt', en: 'Total', zh: '合计' },
  quoteDetail: { de: 'Versand / Steuer', en: 'Shipping / tax', zh: '运费 / 税费' },
  acceptQuote: { de: 'Angebot annehmen', en: 'Accept quote', zh: '接受报价' },
  declineQuote: { de: 'Angebot ablehnen', en: 'Decline quote', zh: '拒绝报价' },
  quoteFailed: { de: 'Das Angebot konnte nicht beantwortet werden.', en: 'The quote could not be answered.', zh: '报价回复失败。' },
  confirmReceipt: { de: 'Erhalt bestätigen', en: 'Confirm receipt', zh: '确认收货' },
  receiptFailed: { de: 'Der Erhalt konnte nicht bestätigt werden.', en: 'Receipt could not be confirmed.', zh: '收货确认失败。' },
  shipment: { de: 'Versand', en: 'Shipment', zh: '物流' },
  carrier: { de: 'Dienstleister', en: 'Carrier', zh: '承运商' },
  trackingNo: { de: 'Sendungsnummer', en: 'Tracking number', zh: '运单号' },
  receipt: { de: 'Erhalt bestätigt am', en: 'Receipt confirmed on', zh: '收货确认时间' },
  returns: { de: 'Rücksendungen', en: 'Returns', zh: '退货记录' },
  requestReturn: { de: 'Rücksendung anfragen', en: 'Request a return', zh: '申请退货' },
  returnReason: { de: 'Grund', en: 'Reason', zh: '退货原因' },
  returnQuantity: { de: 'Menge', en: 'Quantity', zh: '数量' },
  returnSubmit: { de: 'Rücksendung senden', en: 'Send return request', zh: '提交退货申请' },
  returnFailed: { de: 'Die Rücksendung konnte nicht angefragt werden.', en: 'The return request could not be sent.', zh: '退货申请提交失败。' },
  returnExceeds: { de: 'Die Menge übersteigt die verfügbare Stückzahl.', en: 'The quantity exceeds what is available.', zh: '数量超过可申请数量。' },
  review: { de: 'Bewertung', en: 'Review', zh: '评价' },
  rating: { de: 'Sterne (1–5)', en: 'Rating (1–5)', zh: '评分（1–5 星）' },
  reviewContent: { de: 'Ihre Bewertung', en: 'Your review', zh: '评价内容' },
  reviewSubmit: { de: 'Bewertung senden', en: 'Submit review', zh: '提交评价' },
  reviewFailed: { de: 'Die Bewertung konnte nicht gesendet werden.', en: 'The review could not be submitted.', zh: '评价提交失败。' },
  alreadyReviewed: { de: 'Sie haben diese Bestellung bereits bewertet.', en: 'You have already reviewed this order.', zh: '该订单已评价。' },
  cancelReason: { de: 'Stornogrund', en: 'Cancellation reason', zh: '取消原因' },
};

export const VEHICLES = {
  eyebrow: { de: 'ALSVID / Fahrzeuge', en: 'ALSVID / Vehicles', zh: 'ALSVID / 我的车辆' },
  title: { de: 'Meine Fahrzeuge', en: 'My vehicles', zh: '我的车辆' },
  lede: {
    de: 'Fahrzeuge, für die Ihr Konto freigeschaltet ist, inklusive Garantien.',
    en: 'Vehicles your account is approved for, including warranties.',
    zh: '已授权到本账号的车辆，含保修信息。',
  },
  vin: { de: 'FIN', en: 'VIN', zh: '车架号' },
  model: { de: 'Modell', en: 'Model', zh: '车型' },
  producedAt: { de: 'Produziert am', en: 'Produced on', zh: '生产日期' },
  warranty: { de: 'Garantie', en: 'Warranty', zh: '保修' },
  coverage: { de: 'Umfang', en: 'Coverage', zh: '保修范围' },
  period: { de: 'Zeitraum', en: 'Period', zh: '保修期' },
  revoked: { de: 'Widerrufen', en: 'Revoked', zh: '已撤销' },
  empty: {
    de: 'Ihrem Konto ist noch kein Fahrzeug zugeordnet.',
    en: 'No vehicle is assigned to your account yet.',
    zh: '本账号尚未授权任何车辆。',
  },
  requests: { de: 'Zuordnungsanfragen', en: 'Assignment requests', zh: '车辆授权申请' },
  requestTitle: { de: 'Fahrzeug zuordnen lassen', en: 'Request vehicle assignment', zh: '申请绑定车辆' },
  requestLede: {
    de: 'Geben Sie die FIN ein. ALSVID prüft die Zuordnung und schaltet das Fahrzeug frei.',
    en: 'Enter the VIN. ALSVID will verify and release the vehicle.',
    zh: '填写车架号，ALSVID 核实后为您开通该车辆。',
  },
  requestNote: { de: 'Nachricht an ALSVID', en: 'Message to ALSVID', zh: '给 ALSVID 的说明' },
  requestSubmit: { de: 'Zuordnung anfragen', en: 'Request assignment', zh: '提交申请' },
  requestFailed: { de: 'Die Anfrage konnte nicht gesendet werden.', en: 'The request could not be sent.', zh: '申请提交失败。' },
  requestInvalidVin: { de: 'Bitte eine gültige FIN (11–20 Zeichen) eingeben.', en: 'Please enter a valid VIN (11–20 characters).', zh: '请填写有效的车架号（11–20 位）。' },
  requestNoteRequired: { de: 'Bitte eine Nachricht eingeben.', en: 'Please enter a message.', zh: '请填写说明。' },
};

export const VEHICLE_REQUEST_STATUS: Record<string, Text> = {
  pending: { de: 'In Prüfung', en: 'Under review', zh: '审核中' },
  approved: { de: 'Freigeschaltet', en: 'Approved', zh: '已批准' },
  rejected: { de: 'Abgelehnt', en: 'Rejected', zh: '已拒绝' },
  revoked: { de: 'Widerrufen', en: 'Revoked', zh: '已撤销' },
};

export const SERVICE = {
  eyebrow: { de: 'ALSVID / Service', en: 'ALSVID / Service', zh: 'ALSVID / 服务申请' },
  title: { de: 'Serviceanfragen', en: 'Service requests', zh: '服务申请' },
  lede: {
    de: 'Schildern Sie Ihr Anliegen. ALSVID meldet sich mit einem Termin oder einer Lösung.',
    en: 'Describe the issue. ALSVID will reply with an appointment or a solution.',
    zh: '描述您遇到的问题，ALSVID 会回复预约或解决方案。',
  },
  empty: { de: 'Noch keine Serviceanfrage.', en: 'No service request yet.', zh: '暂无服务申请。' },
  formTitle: { de: 'Neue Serviceanfrage', en: 'New service request', zh: '新建服务申请' },
  vehicle: { de: 'Fahrzeug', en: 'Vehicle', zh: '车辆' },
  center: { de: 'Servicepartner', en: 'Service partner', zh: '服务网点' },
  anyCenter: { de: 'Kein Wunsch / ALSVID entscheidet', en: 'No preference / ALSVID decides', zh: '不限 / 由 ALSVID 安排' },
  description: { de: 'Beschreibung', en: 'Description', zh: '问题描述' },
  descriptionPlaceholder: {
    de: 'z. B. Unterstützung setzt beim Anfahren aus, Fehlercode E3',
    en: 'e.g. assistance cuts out when pulling away, error code E3',
    zh: '例如：起步时助力中断，报错 E3',
  },
  submit: { de: 'Anfrage senden', en: 'Send request', zh: '提交申请' },
  needVehicle: {
    de: 'Für eine Serviceanfrage muss Ihrem Konto zuerst ein Fahrzeug zugeordnet sein.',
    en: 'A vehicle must be assigned to your account before raising a service request.',
    zh: '需先为账号绑定车辆，才能提交服务申请。',
  },
  failed: { de: 'Die Serviceanfrage konnte nicht gesendet werden.', en: 'The service request could not be sent.', zh: '服务申请提交失败。' },
  descriptionRequired: { de: 'Bitte beschreiben Sie Ihr Anliegen.', en: 'Please describe the issue.', zh: '请填写问题描述。' },
  createdAt: { de: 'Gesendet am', en: 'Sent on', zh: '提交时间' },
  reply: { de: 'Antwort von ALSVID', en: 'Reply from ALSVID', zh: 'ALSVID 回复' },
  workOrder: { de: 'Auftrag', en: 'Work order', zh: '工单号' },
};

export const SERVICE_STATUS: Record<string, Text> = {
  submitted: { de: 'Eingegangen', en: 'Received', zh: '已提交' },
  accepted: { de: 'Angenommen', en: 'Accepted', zh: '已受理' },
  rejected: { de: 'Abgelehnt', en: 'Rejected', zh: '未受理' },
};

export const REPAIRS = {
  eyebrow: { de: 'ALSVID / Servicehistorie', en: 'ALSVID / Service history', zh: 'ALSVID / 维修履历' },
  title: { de: 'Servicehistorie', en: 'Service history', zh: '维修履历' },
  lede: {
    de: 'Abgeschlossene und laufende Reparaturen mit Kostenvoranschlägen.',
    en: 'Completed and ongoing repairs with quotes.',
    zh: '已完成的与进行中的维修记录及报价。',
  },
  empty: { de: 'Noch keine Reparatur erfasst.', en: 'No repair recorded yet.', zh: '暂无维修记录。' },
  workOrder: { de: 'Auftrag', en: 'Work order', zh: '工单号' },
  vin: { de: 'FIN', en: 'VIN', zh: '车架号' },
  type: { de: 'Art', en: 'Type', zh: '类型' },
  fault: { de: 'Befund', en: 'Finding', zh: '故障描述' },
  center: { de: 'Servicepartner', en: 'Service partner', zh: '服务网点' },
  createdAt: { de: 'Erfasst am', en: 'Recorded on', zh: '创建时间' },
  quotes: { de: 'Kostenvoranschläge', en: 'Quotes', zh: '报价' },
  revision: { de: 'Version', en: 'Revision', zh: '版本' },
  labor: { de: 'Arbeit', en: 'Labour', zh: '工时' },
  parts: { de: 'Teile', en: 'Parts', zh: '配件' },
  other: { de: 'Sonstiges', en: 'Other', zh: '其他' },
  total: { de: 'Gesamt', en: 'Total', zh: '合计' },
  quoteNote: { de: 'Hinweis', en: 'Note', zh: '说明' },
  decision: { de: 'Ihre Entscheidung', en: 'Your decision', zh: '您的决定' },
  accepted: { de: 'Angenommen', en: 'Accepted', zh: '已接受' },
  declined: { de: 'Abgelehnt', en: 'Declined', zh: '已拒绝' },
  accept: { de: 'Kostenvoranschlag annehmen', en: 'Accept quote', zh: '接受报价' },
  decline: { de: 'Ablehnen', en: 'Decline', zh: '拒绝' },
  decisionNote: { de: 'Anmerkung', en: 'Comment', zh: '备注' },
  decisionFailed: { de: 'Die Entscheidung konnte nicht gespeichert werden.', en: 'The decision could not be saved.', zh: '决定保存失败。' },
  staleQuote: { de: 'Es liegt ein neuerer Kostenvoranschlag vor. Bitte Seite neu laden.', en: 'A newer quote exists. Please reload the page.', zh: '已有更新报价，请刷新页面。' },
  statusHistory: { de: 'Verlauf', en: 'History', zh: '状态流转' },
  payments: { de: 'Zahlungen', en: 'Payments', zh: '付款记录' },
};

// repairs.status 是数据库中的中文值，必须三语映射
export const REPAIR_STATUS: Record<string, Text> = {
  待收货: { de: 'Wareneingang ausstehend', en: 'Awaiting drop-off', zh: '待收货' },
  维修中: { de: 'In Reparatur', en: 'In repair', zh: '维修中' },
  待配件: { de: 'Warten auf Ersatzteil', en: 'Awaiting parts', zh: '待配件' },
  已完成: { de: 'Abgeschlossen', en: 'Completed', zh: '已完成' },
  已关闭: { de: 'Geschlossen', en: 'Closed', zh: '已关闭' },
};

export const REPAIR_TYPE: Record<string, Text> = {
  质保维修: { de: 'Garantiereparatur', en: 'Warranty repair', zh: '质保维修' },
  付费维修: { de: 'Kostenpflichtige Reparatur', en: 'Paid repair', zh: '付费维修' },
  返修: { de: 'Nacharbeit', en: 'Rework', zh: '返修' },
  售后服务: { de: 'Kundendienst', en: 'Service', zh: '售后服务' },
};

export const SECURITY = {
  eyebrow: { de: 'ALSVID / Konto', en: 'ALSVID / Account', zh: 'ALSVID / 账号' },
  title: { de: 'Konto & Sicherheit', en: 'Account & security', zh: '账号与安全' },
  lede: {
    de: 'Passwort ändern und Sitzung beenden. Nach der Änderung ist eine neue Anmeldung nötig.',
    en: 'Change your password and end your session. You will need to sign in again afterwards.',
    zh: '修改密码与结束会话。修改后需要重新登录。',
  },
  account: { de: 'Konto', en: 'Account', zh: '账号' },
  role: { de: 'Rolle', en: 'Role', zh: '角色' },
  changeTitle: { de: 'Passwort ändern', en: 'Change password', zh: '修改密码' },
  oldPassword: { de: 'Aktuelles Passwort', en: 'Current password', zh: '当前密码' },
  newPassword: { de: 'Neues Passwort', en: 'New password', zh: '新密码' },
  confirmPassword: { de: 'Neues Passwort wiederholen', en: 'Repeat new password', zh: '确认新密码' },
  change: { de: 'Passwort ändern', en: 'Change password', zh: '修改密码' },
  changed: {
    de: 'Passwort geändert. Bitte melden Sie sich erneut an.',
    en: 'Password changed. Please sign in again.',
    zh: '密码已修改，请重新登录。',
  },
  mismatch: { de: 'Die neuen Passwörter stimmen nicht überein.', en: 'The new passwords do not match.', zh: '两次输入的新密码不一致。' },
  failed: { de: 'Das Passwort konnte nicht geändert werden.', en: 'The password could not be changed.', zh: '密码修改失败。' },
  sessionTitle: { de: 'Sitzung', en: 'Session', zh: '会话' },
  logout: { de: 'Jetzt abmelden', en: 'Sign out now', zh: '立即退出登录' },
};
