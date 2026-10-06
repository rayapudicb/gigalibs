// WI-OI-120l (U12), WI-OI-120s (S16): the general ledger's five metadata windows. Edit here, then run
// `node scripts/generate-windows.mjs financial-operations` and `pnpm modules:catalog`.

const ACCOUNT_CLASSES = [['ASSET', 'Asset'], ['LIABILITY', 'Liability'], ['EQUITY', 'Equity'], ['REVENUE', 'Revenue'], ['EXPENSE', 'Expense']];
const SUBTYPES = [
  ['BANK', 'Bank'], ['ACCOUNTS_RECEIVABLE', 'Accounts receivable'], ['CURRENT_ASSET', 'Current asset'], ['FIXED_ASSET', 'Fixed asset'],
  ['OTHER_ASSET', 'Other asset'], ['ACCOUNTS_PAYABLE', 'Accounts payable'], ['CURRENT_LIABILITY', 'Current liability'],
  ['LONG_TERM_LIABILITY', 'Long-term liability'], ['EQUITY', 'Equity'], ['RETAINED_EARNINGS', 'Retained earnings'],
  ['OPERATING_REVENUE', 'Operating revenue'], ['OTHER_REVENUE', 'Other revenue'], ['COST_OF_GOODS_SOLD', 'Cost of goods sold'],
  ['OPERATING_EXPENSE', 'Operating expense'], ['TAX_EXPENSE', 'Tax expense'], ['OTHER_EXPENSE', 'Other expense'],
];
const BALANCES = [['DEBIT', 'Debit'], ['CREDIT', 'Credit']];
const PERIOD_STATUSES = [['FUTURE', 'Future'], ['OPEN', 'Open'], ['SOFT_CLOSED', 'Soft-closed'], ['LOCKED', 'Locked']];
const JOURNAL_STATUSES = [['DRAFT', 'Draft'], ['POSTED', 'Posted'], ['REVERSED', 'Reversed']];
const ENTRY_TYPES = [
  ['STANDARD_MANUAL', 'Manual'], ['SUBLEDGER_AP', 'Payables'], ['SUBLEDGER_AR', 'Receivables'], ['SUBLEDGER_INVENTORY', 'Inventory'],
  ['REVERSAL', 'Reversal'], ['YEAR_END_CLOSE', 'Year-end close'], ['OPENING_BALANCE', 'Opening balance'],
];
const MANUAL_TYPES = [['STANDARD_MANUAL', 'Manual'], ['OPENING_BALANCE', 'Opening balance']];
const DRAFT_STATUSES = [['DRAFT', 'Draft'], ['SUBMITTED', 'Submitted for approval'], ['POSTED', 'Posted']];
const COSTING = [['STANDARD', 'Standard'], ['FIFO', 'FIFO'], ['AVERAGE', 'Moving average']];
const BOOK_STATUSES = [['ACTIVE', 'Active'], ['INACTIVE', 'Inactive']];

export function windowSource(builderFor) {
  const { entity, field, values, lookup, tab, section, relationship, action, view, dictionary, window, REASON_REQUIRED, REASON_OPTIONAL } = builderFor({
    route: '/finance',
    createWith: { 'finance-accounts': ['financial-operations', 'finance-accounts', 'finance:coa:manage'] },
  });
  const act = (entityKey, key, label, permission, condition, prompt, parameters) =>
    action(entityKey, key, label, permission, condition, prompt, parameters, { parametersLast: true });
  const BOOK_REF = lookup('book-ref', 'finance-books');
  const ACCOUNT_REF = lookup('account-ref', 'finance-accounts');
  const windows = {};

  // 1. Books (set up from the Finance page's set-up panel)
  const B = 'finance.books';
  const bf = [
    field(B, 'book-code', 'Code'), field(B, 'book-name', 'Name'), field(B, 'currency-code', 'Currency'),
    field(B, 'costing-method', 'Costing method', 'SELECT', { ref: 'costing' }), field(B, 'is-primary', 'Primary book', 'BOOLEAN'),
    field(B, 'status', 'Status', 'SELECT', { ref: 'book-statuses' }),
  ];
  windows['finance-books'] = window('finance-books', 'Accounting books', 'Books', 'The books your organization keeps its ledger in.', 'finance:read',
    dictionary('finance-books', 'Accounting books', B, [entity(B, 'Books')], bf, [], [values('costing', COSTING), values('book-statuses', BOOK_STATUSES)], [
      view('books', 'Accounting books', [
        tab('book', 'Book', 0, B, [['book-code', 3], ['book-name', 6], ['currency-code', 3], ['costing-method', 4], ['is-primary', 4], ['status', 4]], bf),
      ], { search: ['book-code', 'book-name'], sort: 'book-code' }),
    ]));

  // 2. Chart of accounts
  const A = 'finance.accounts';
  const af = [
    field(A, 'accounting-book-id', 'Book', 'REFERENCE', { required: true, ref: 'book-ref' }),
    field(A, 'account-code', 'Code', 'TEXT', { required: true, help: 'For example 1000 for cash at bank.' }), field(A, 'account-name', 'Name', 'TEXT', { required: true }),
    field(A, 'account-class', 'Class', 'SELECT', { required: true, ref: 'account-classes' }),
    field(A, 'account-subtype', 'Subtype', 'SELECT', { required: true, ref: 'account-subtypes' }),
    field(A, 'normal-balance', 'Normal balance', 'SELECT', { required: true, ref: 'balances', help: 'Assets and expenses are usually debit; the others credit.' }),
    field(A, 'parent-account-id', 'Parent account', 'REFERENCE', { ref: 'account-ref' }),
    field(A, 'is-reconcilable', 'Reconciled with a bank or statement', 'BOOLEAN'), field(A, 'is-subledger-control', 'Subledger control account', 'BOOLEAN'),
    field(A, 'active', 'Active', 'BOOLEAN'),
  ];
  windows['finance-accounts'] = window('finance-accounts', 'Chart of accounts', 'Chart of accounts', 'The accounts journals post to, by book.', 'finance:read',
    dictionary('finance-accounts', 'Chart of accounts', A, [entity(A, 'Accounts')], af, [],
      [values('account-classes', ACCOUNT_CLASSES), values('account-subtypes', SUBTYPES), values('balances', BALANCES), BOOK_REF, ACCOUNT_REF], [
        view('accounts', 'Chart of accounts', [
          tab('account', 'Account', 0, A, [
            ['account-code', 3, 'main'], ['account-name', 6, 'main'], ['active', 3, 'main'], ['accounting-book-id', 6, 'main'], ['account-class', 3, 'main'],
            ['normal-balance', 3, 'main'], ['account-subtype', 6, 'more'], ['parent-account-id', 6, 'more'], ['is-reconcilable', 6, 'more'],
            ['is-subledger-control', 6, 'more'],
          ], af, { sections: [section('main', 'Account', 0), section('more', 'Reporting and control', 1)] }),
        ], { search: ['account-code', 'account-name'], sort: 'account-code' }),
      ]));

  // 3. Fiscal periods: open, soft-close, lock
  const P = 'finance.periods';
  const pf = [
    field(P, 'accounting-book-id', 'Book', 'REFERENCE', { readOnly: true, ref: 'book-ref' }), field(P, 'period-number', 'Period', 'INTEGER', { readOnly: true }),
    field(P, 'period-name', 'Name', 'TEXT', { readOnly: true }), field(P, 'start-date', 'Starts', 'DATE', { readOnly: true }),
    field(P, 'end-date', 'Ends', 'DATE', { readOnly: true }), field(P, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'period-statuses' }),
  ];
  windows['finance-periods'] = window('finance-periods', 'Fiscal periods', 'Periods', 'Open, soft-close and lock the periods journals post to.', 'finance:read',
    dictionary('finance-periods', 'Fiscal periods', P, [entity(P, 'Periods')], pf, [], [values('period-statuses', PERIOD_STATUSES), BOOK_REF], [
      view('periods', 'Fiscal periods', [
        tab('period', 'Period', 0, P, [['period-name', 4], ['accounting-book-id', 4], ['status', 4], ['period-number', 2], ['start-date', 3], ['end-date', 3]], pf),
      ], { search: ['period-name'], sort: 'start-date' }),
    ], [
      act(P, 'open', 'Open', 'finance:periods:manage', ['status', 'IN', ['FUTURE', 'SOFT_CLOSED']], 'Open this period for posting?', REASON_OPTIONAL),
      act(P, 'soft-close', 'Soft-close', 'finance:periods:manage', ['status', 'EQ', 'OPEN'], 'Soft-close this period? Only adjustments should post to it now.', REASON_REQUIRED),
      act(P, 'lock', 'Lock', 'finance:periods:manage', ['status', 'NEQ', 'LOCKED'], 'Lock this period? Nothing can post to it once locked.', REASON_REQUIRED),
    ]));

  // 4. Journal drafts with their lines: submit, approve (a second person), return
  const D = 'finance.journal-drafts';
  const DL = 'finance.journal-draft-lines';
  const df = [
    field(D, 'accounting-book-id', 'Book', 'REFERENCE', { required: true, ref: 'book-ref' }),
    field(D, 'posting-date', 'Posting date', 'DATE', { required: true, help: 'The period is found from this date.' }),
    field(D, 'entry-type', 'Kind', 'SELECT', { ref: 'manual-types' }), field(D, 'description', 'Description', 'TEXT', { required: true }),
    field(D, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'draft-statuses' }),
    field(D, 'total-debit-minor', 'Total debits (minor units)', 'NUMBER', { readOnly: true, scale: 0 }),
    field(D, 'total-credit-minor', 'Total credits (minor units)', 'NUMBER', { readOnly: true, scale: 0 }), field(D, 'line-count', 'Lines', 'INTEGER', { readOnly: true }),
    field(D, 'submitted-by', 'Submitted by', 'TEXT', { readOnly: true }), field(D, 'approved-by', 'Approved by', 'TEXT', { readOnly: true }),
    field(D, 'returned-reason', 'Returned because', 'TEXTAREA', { readOnly: true }), field(D, 'posted-journal-id', 'Posted journal', 'TEXT', { readOnly: true }),
    field(D, 'updated-at', 'Last changed', 'DATETIME', { readOnly: true }),
    field(DL, 'draft-id', 'Journal', 'TEXT', { help: 'Set from the journal the line belongs to.' }), field(DL, 'line-number', 'Line', 'INTEGER', { readOnly: true }),
    field(DL, 'account-id', 'Account', 'REFERENCE', { required: true, ref: 'account-ref' }),
    field(DL, 'debit-amount-minor', 'Debit (minor units)', 'NUMBER', { scale: 0, help: '1250 is 12.50. A line has a debit or a credit.' }),
    field(DL, 'credit-amount-minor', 'Credit (minor units)', 'NUMBER', { scale: 0 }), field(DL, 'memo', 'Memo'),
    field(DL, 'draft-status', 'Journal status', 'SELECT', { readOnly: true, ref: 'draft-statuses' }),
  ];
  windows['finance-journal-drafts'] = window('finance-journal-drafts', 'Journal entry', 'Journal entry',
    'Draft a journal, add its lines and submit it; a second person approves and posts it.', 'finance:read',
    dictionary('finance-journal-drafts', 'Journal entry', D, [entity(D, 'Journal drafts'), entity(DL, 'Lines')], df, [relationship('draft-lines', D, DL, 'draft-id')],
      [values('manual-types', MANUAL_TYPES), values('draft-statuses', DRAFT_STATUSES), BOOK_REF, ACCOUNT_REF], [
        view('journal-drafts', 'Journal entry', [
          tab('draft', 'Journal', 0, D, [
            ['description', 6, 'main'], ['status', 3, 'main'], ['entry-type', 3, 'main'], ['accounting-book-id', 6, 'main'], ['posting-date', 3, 'main'],
            ['line-count', 3, 'main'], ['total-debit-minor', 6, 'totals'], ['total-credit-minor', 6, 'totals'], ['submitted-by', 4, 'approval'],
            ['approved-by', 4, 'approval'], ['posted-journal-id', 4, 'approval'], ['returned-reason', 12, 'approval'], ['updated-at', 4, 'approval'],
          ], df, { sections: [section('main', 'Journal', 0), section('totals', 'Totals', 1), section('approval', 'Approval', 2)] }),
          tab('lines', 'Lines', 1, DL, [['line-number', 2], ['account-id', 4], ['debit-amount-minor', 3], ['credit-amount-minor', 3], ['memo', 12]], df, { parent: 'draft-lines' }),
        ], { search: ['description'], sort: 'updated-at' }),
      ], [
        act(D, 'submit', 'Submit for approval', 'finance:journals:post', ['status', 'EQ', 'DRAFT'], 'Submit this journal? Someone else must approve it before it posts.'),
        act(D, 'approve', 'Approve and post', 'finance:journals:approve', ['status', 'EQ', 'SUBMITTED'],
          'Approve and post this journal to the ledger? You cannot approve a journal you submitted.', REASON_REQUIRED),
        act(D, 'return', 'Return to author', 'finance:journals:approve', ['status', 'EQ', 'SUBMITTED'], 'Send this journal back to its author as a draft?', REASON_REQUIRED),
        act(DL, 'remove', 'Remove line', 'finance:journals:post', ['draft-status', 'EQ', 'DRAFT'], 'Remove this line?'),
      ]));

  // 5. Posted journals with their lines: reverse
  const J = 'finance.journals';
  const JL = 'finance.journal-lines';
  const jf = [
    field(J, 'journal-number', 'Number', 'TEXT', { readOnly: true }), field(J, 'description', 'Description', 'TEXT', { readOnly: true }),
    field(J, 'accounting-book-id', 'Book', 'REFERENCE', { readOnly: true, ref: 'book-ref' }), field(J, 'posting-date', 'Posting date', 'DATE', { readOnly: true }),
    field(J, 'entry-type', 'Kind', 'SELECT', { readOnly: true, ref: 'entry-types' }), field(J, 'status', 'Status', 'SELECT', { readOnly: true, ref: 'journal-statuses' }),
    field(J, 'total-debit-minor', 'Total debits (minor units)', 'NUMBER', { readOnly: true, scale: 0 }),
    field(J, 'total-credit-minor', 'Total credits (minor units)', 'NUMBER', { readOnly: true, scale: 0 }),
    field(J, 'source-document-type', 'Source', 'TEXT', { readOnly: true }), field(J, 'posted-by', 'Posted by', 'TEXT', { readOnly: true }),
    field(J, 'reversed-journal-id', 'Reverses journal', 'TEXT', { readOnly: true }),
    field(JL, 'journal-id', 'Journal', 'TEXT', { readOnly: true }), field(JL, 'line-number', 'Line', 'INTEGER', { readOnly: true }),
    field(JL, 'account-id', 'Account', 'REFERENCE', { readOnly: true, ref: 'account-ref' }),
    field(JL, 'debit-amount-minor', 'Debit (minor units)', 'NUMBER', { readOnly: true, scale: 0 }),
    field(JL, 'credit-amount-minor', 'Credit (minor units)', 'NUMBER', { readOnly: true, scale: 0 }),
    field(JL, 'currency-code', 'Currency', 'TEXT', { readOnly: true }), field(JL, 'memo', 'Memo', 'TEXT', { readOnly: true }),
  ];
  const REVERSE = [
    { key: 'reason', label: 'Reason', type: 'TEXTAREA', required: true },
    { key: 'reversal-date', label: 'Reversal date (YYYY-MM-DD, default today)', type: 'TEXT', required: false },
  ];
  windows['finance-journals'] = window('finance-journals', 'Posted journals', 'Posted journals', 'The journals in the ledger, with their lines; reverse a posted one.', 'finance:read',
    dictionary('finance-journals', 'Posted journals', J, [entity(J, 'Journals'), entity(JL, 'Lines')], jf, [relationship('journal-lines', J, JL, 'journal-id')],
      [values('entry-types', ENTRY_TYPES), values('journal-statuses', JOURNAL_STATUSES), BOOK_REF, ACCOUNT_REF], [
        view('journals', 'Posted journals', [
          tab('journal', 'Journal', 0, J, [
            ['journal-number', 3, 'main'], ['description', 9, 'main'], ['posting-date', 3, 'main'], ['entry-type', 3, 'main'], ['status', 3, 'main'],
            ['accounting-book-id', 3, 'main'], ['total-debit-minor', 6, 'main'], ['total-credit-minor', 6, 'main'], ['source-document-type', 4, 'more'],
            ['posted-by', 4, 'more'], ['reversed-journal-id', 4, 'more'],
          ], jf, { sections: [section('main', 'Journal', 0), section('more', 'Origin', 1)] }),
          tab('lines', 'Lines', 1, JL, [['line-number', 2], ['account-id', 4], ['debit-amount-minor', 3], ['credit-amount-minor', 3], ['currency-code', 2], ['memo', 10]], jf,
            { parent: 'journal-lines' }),
        ], { search: ['journal-number', 'description'], sort: 'posting-date' }),
      ], [
        act(J, 'reverse', 'Reverse', 'finance:journals:reverse', ['status', 'EQ', 'POSTED'],
          'Reverse this journal? A reversing journal is posted; the original stays in the ledger.', REVERSE),
      ]));

  return windows;
}
