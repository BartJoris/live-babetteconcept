import {
  ACTION_CATEGORY_ORDER,
  type ActionCategory,
} from '@/lib/accounting/insights';

export type AutomationStatus =
  | 'in_app'
  | 'partial'
  | 'planned'
  | 'keep_in_odoo'
  | 'keep_with_partner';

export type ProcessGuide = {
  category: ActionCategory;
  when: string;
  odooWhere: string;
  odooHref: string;
  steps: string[];
  check: string;
  pitfall: string;
  automation: {
    status: AutomationStatus;
    now: string;
    next: string;
    appHref?: string;
    appLabel?: string;
  };
};

export type ChecklistItem = {
  id: string;
  cadence: 'week' | 'month' | 'quarter';
  title: string;
  categories: ActionCategory[];
  href?: string;
  hrefLabel?: string;
};

const ODOO_WEB = 'https://www.babetteconcept.be/web';

function odooList(model: string, extra = ''): string {
  return `${ODOO_WEB}#model=${model}&view_type=list${extra}`;
}

export function automationStatusLabel(status: AutomationStatus): string {
  switch (status) {
    case 'in_app':
      return 'Kan via deze app';
    case 'partial':
      return 'Deels in deze app';
    case 'planned':
      return 'Te automatiseren';
    case 'keep_in_odoo':
      return 'Blijft in Odoo';
    case 'keep_with_partner':
      return 'Bij partner houden';
    default: {
      const _exhaustive: never = status;
      return _exhaustive;
    }
  }
}

export function getProcessGuide(category: ActionCategory): ProcessGuide {
  switch (category) {
    case 'in_invoice':
      return {
        category,
        when: 'Elke keer een leveranciersfactuur binnenkomt (Play UP, merken, huur, energie, …).',
        odooWhere: 'Boekhouding → Leveranciers → Facturen',
        odooHref: odooList('account.move'),
        steps: [
          'Open een nieuwe leveranciersfactuur (Vendor Bill).',
          'Kies de leverancier. Controleer of het btw-nummer klopt.',
          'Vul factuurnummer (referentie), factuurdatum en vervaldatum in zoals op de PDF.',
          'Voeg lijnen toe: rekening (bijv. aankopen handelsgoederen of kosten), bedrag excl. btw, btw-tarief (21% of 6%).',
          'Controleer of het totaal inclusief btw overeenkomt met de PDF.',
          'Voeg de PDF toe als bijlage.',
          'Bevestigen / Boeken. De factuur staat dan open tot ze betaald of afgeletterd is.',
        ],
        check: 'Openstaande leveranciersfacturen: het saldo moet gelijk zijn aan wat je nog moet betalen.',
        pitfall: 'Boek geen factuur twee keer (PDF + banklijn als extra kost). De bankafschriftregel is de betaling, niet de aankoop.',
        automation: {
          status: 'planned',
          now: 'Deze app leest al leveranciers-PDF’s voor productimport, maar maakt nog geen boekhoudingsfactuur.',
          next: 'Zelfde PDF → concept-aankoopfactuur in Odoo (leverancier, lijnen, btw, bijlage), jij klikt alleen Boeken na controle.',
          appHref: '/smart-upload',
          appLabel: 'Slim uploaden (PDF’s)',
        },
      };
    case 'in_refund':
      return {
        category,
        when: 'Bij retour naar de leverancier, prijsverlaging of correctie op een eerdere aankoopfactuur.',
        odooWhere: 'Boekhouding → Leveranciers → Creditnota’s',
        odooHref: odooList('account.move'),
        steps: [
          'Open de originele aankoopfactuur of maak een creditnota leverancier.',
          'Kies dezelfde leverancier en verwijs naar het originele factuurnummer.',
          'Boek de lijnen spiegelbeeld (zelfde rekeningen en btw als de originele factuur).',
          'Bevestigen. Letter nadien af tegen de openstaande factuur of de terugbetaling op de bank.',
        ],
        check: 'De creditnota verlaagt wat je nog aan die leverancier verschuldigd bent.',
        pitfall: 'Een creditnota is geen betaling. Eerst boeken, daarna afletteren met factuur of bank.',
        automation: {
          status: 'planned',
          now: 'Nog manueel in Odoo.',
          next: 'Zelfde PDF-flow als aankoopfacturen, herkend als creditnota (negatief / “credit note”).',
        },
      };
    case 'out_invoice':
      return {
        category,
        when: 'Klantfacturen: kassa (POS) en webshop maken die meestal automatisch. Manueel alleen voor B2B of correcties.',
        odooWhere: 'Boekhouding → Klanten → Facturen',
        odooHref: odooList('account.move'),
        steps: [
          'Controleer of POS- en webshoporders een klantfactuur of ticket hebben aangemaakt.',
          'Voor B2B (stockverkoop, groothandel): nieuwe klantfactuur, klant, lijnen, btw, bevestigen.',
          'Stuur de factuur of laat Odoo die mailen.',
        ],
        check: 'Omzet in Odoo moet aansluiten bij kassa + webshop voor dezelfde periode.',
        pitfall: 'Maak geen tweede factuur voor een verkoop die de kassa al geboekt heeft.',
        automation: {
          status: 'partial',
          now: 'POS en webshop boeken verkopen al in Odoo. Deze app toont ze in inzichten; je hoeft ze zelden manueel aan te maken.',
          next: 'Uitzondering: B2B-stockverkoopfactuur vanuit een bestaande offerte in deze app.',
          appHref: '/offerte-excel',
          appLabel: 'Offertes',
        },
      };
    case 'out_refund':
      return {
        category,
        when: 'Retour in de winkel, webshopteruggave of prijscredit naar een klant.',
        odooWhere: 'Boekhouding → Klanten → Creditnota’s',
        odooHref: odooList('account.move'),
        steps: [
          'Zoek de originele factuur of POS-order.',
          'Maak een creditnota (of verwerk de retour via POS, dat boekt vaak al een credit).',
          'Zelfde producten/btw als de originele verkoop.',
          'Bevestigen. Terugbetaling volgt via kassa, Mollie of overschrijving — dat is een aparte bank/betaalstap.',
        ],
        check: 'Creditnota verlaagt de klantvordering; de terugbetaling moet later op de bank afgeletterd worden.',
        pitfall: 'Niet zowel in POS als nog eens manueel in Boekhouding crediteren.',
        automation: {
          status: 'keep_in_odoo',
          now: 'POS/webshopretouren boeken dit vaak al. Manuele B2B-credits blijven in Odoo.',
          next: 'Later: creditnota-knop vanuit webshoporder in deze app (orders beheren).',
          appHref: '/webshoporders-beheren',
          appLabel: 'Webshoporders',
        },
      };
    case 'payment_inbound':
      return {
        category,
        when: 'Geld komt binnen (klant betaalt factuur, Mollie-uitbetaling is iets anders: dat is bank).',
        odooWhere: 'Boekhouding → Klanten → Betalingen',
        odooHref: odooList('account.payment'),
        steps: [
          'Voorkeur: letter de betaling af vanaf het bankafschrift, niet via een aparte “betaling registreren”.',
          'Alleen een losse ontvangst boeken als er geen banklijn is (cash, of nog niet geïmporteerd).',
          'Kies de klant, het bedrag, het journaal (kas of bank) en de openstaande factuur.',
          'Bevestigen. De factuur moet daarna “Betaald” zijn.',
        ],
        check: 'Openstaande klantfacturen dalen met het ontvangen bedrag.',
        pitfall: 'Niet dubbel boeken: bankimport + extra “ontvangen betaling” voor dezelfde Mollie-batch.',
        automation: {
          status: 'planned',
          now: 'Nog manueel, of via bankreconciliatie in Odoo.',
          next: 'Voorstel: openstaande facturen automatisch matchen aan banklijnen (naam, bedrag, mededeling).',
        },
      };
    case 'payment_outbound':
      return {
        category,
        when: 'Je betaalt een leverancier (overschrijving). Vaak zichtbaar als partner dit registreert naast de bank.',
        odooWhere: 'Boekhouding → Leveranciers → Betalingen',
        odooHref: odooList('account.payment'),
        steps: [
          'Voorkeur: betaal vanuit de openstaande aankoopfactuur of letter af op het bankafschrift.',
          'Selecteer de facturen die je wilt betalen, controleer IBAN van de leverancier.',
          'Registreer de betaling op het juiste bankjournaal en de valutadatum van de overschrijving.',
          'Bevestigen. Facturen moeten “Betaald” zijn.',
        ],
        check: 'Openstaand leverancierssaldo = wat nog op de rekening moet vertrekken.',
        pitfall: 'Betaaldatum = datum van de bank, niet de factuurdatum.',
        automation: {
          status: 'planned',
          now: 'Nog manueel in Odoo.',
          next: 'Betaalvoorstel in deze app: vervallen aankoopfacturen, totaal, en na jouw OK een betaling in Odoo (zonder de overschrijving bij de bank zelf te plaatsen).',
        },
      };
    case 'bank_statement':
      return {
        category,
        when: 'Wekelijks of na elke Mollie-settlement / bankexport. Dit is het hart van de aflettering.',
        odooWhere: 'Boekhouding → Bank → Reconciliatie',
        odooHref: odooList('account.bank.statement.line'),
        steps: [
          'Importeer banklijnen (Mollie kan via deze app; andere banken via CODA/CSV in Odoo).',
          'Open Reconciliatie op het juiste journaal (Mollie, zichtrekening, …).',
          'Match elke lijn: klantfactuur, leveranciersfactuur, of een kostenrekening (stripe/mollie-fees, huur).',
          'Valideer. Niets mag op “wachtpost” blijven staan zonder reden.',
        ],
        check: 'Saldo van het bankjournaal in Odoo = saldo op de bank/Mollie voor die dag.',
        pitfall: 'Fees (Mollie-kosten) zijn geen omzet. Boek ze als bankkost, niet als korting op de verkoop.',
        automation: {
          status: 'in_app',
          now: 'Mollie-settlements exporteren/importeren kan via Boekhouding → Mollie Export. Per settlement een afschrift aanmaken (begin/eindsaldo 0, gekoppelde lijnen) met automatische groen/rood-check, plus de maandelijkse commissiecontrole en kassasessies op 550001: Mollie Boekhouding Verwerken.',
          next: 'Zelfde flow voor PayPal en Worldline, plus automatische match-suggesties (factuur ↔ lijn).',
          appHref: '/mollie-boekhouding',
          appLabel: 'Mollie Boekhouding Verwerken',
        },
      };
    case 'vat_entry':
      return {
        category,
        when: 'Elk kwartaal (Belgische btw-aangifte), plus eventuele correcties.',
        odooWhere: 'Boekhouding → Rapportage → BTW',
        odooHref: `${ODOO_WEB}#action=account.report`,
        steps: [
          'Sluit de periode af: alle aankoop- en verkoopfacturen van het kwartaal moeten geboekt zijn.',
          'Draai het btw-rapport in Odoo (vakken 00–72 / listing).',
          'Controleer: btw op verkopen minus hernieuwbare btw op aankopen = te betalen of terug te krijgen.',
          'De partner dient doorgaans Intervat in. Jij levert volledige, geboekte stukken aan.',
        ],
        check: 'Geen conceptfacturen meer in het kwartaal; btw-rekeningen sluiten aan op het rapport.',
        pitfall: 'Aangifte indienen zonder dat alle facturen geboekt zijn, of dubbele btw op POS + factuur.',
        automation: {
          status: 'keep_with_partner',
          now: 'Deze app toont btw-gerelateerde boekingen van de partner. Indienen bij Intervat blijft hun (of jullie boekhouder) verantwoordelijkheid.',
          next: 'Wel automatiseerbaar: kwartaalchecklist + export van de Odoo-btw-cijfers ter controle vóór de partner indient.',
        },
      };
    case 'entry':
      return {
        category,
        when: 'Correcties, afschrijvingen, loon, huur als die niet via aankoopfactuur lopen, openingsbalans, voorraadcorrecties.',
        odooWhere: 'Boekhouding → Diverse bewerkingen / Journaalboekingen',
        odooHref: odooList('account.move'),
        steps: [
          'Nieuwe journaalboeking op het juiste journaal (algemeen, afschrijvingen, …).',
          'Minstens twee lijnen: debet en credit moeten in evenwicht zijn.',
          'Korte omschrijving: waarom deze boeking (bv. “afschrijving winkelinrichting maart”).',
          'Bevestigen. Voeg indien nodig een bijlage toe (berekening, mail van de partner).',
        ],
        check: 'Debet = credit. Na de boeking klopt de betrokken rekening (geen “zwevend” bedrag).',
        pitfall: 'Gebruik geen diverse boeking als het eigenlijk een factuur of banklijn is — dan verdwijnt de audit trail.',
        automation: {
          status: 'planned',
          now: 'Eenmalige correcties blijven manueel (en dat is goed: je wilt ze zien).',
          next: 'Terugkerende boekingen (huur, afschrijving) als sjabloon in deze app: één keer definiëren, maandelijks concept in Odoo.',
        },
      };
    default: {
      const _exhaustive: never = category;
      return _exhaustive;
    }
  }
}

export function allProcessGuides(): ProcessGuide[] {
  return ACTION_CATEGORY_ORDER.map((category) => getProcessGuide(category));
}

export const ACCOUNTING_CHECKLIST: ChecklistItem[] = [
  {
    id: 'bank-mollie',
    cadence: 'week',
    title: 'Mollie-afschriften aanmaken en op groen zetten (begin/eindsaldo 0)',
    categories: ['bank_statement'],
    href: '/mollie-boekhouding',
    hrefLabel: 'Mollie Boekhouding Verwerken',
  },
  {
    id: 'mollie-commissie-kassa',
    cadence: 'month',
    title: 'Mollie-commissiefactuur en kassasessies (550001) controleren',
    categories: ['bank_statement', 'payment_inbound'],
    href: '/mollie-boekhouding',
    hrefLabel: 'Mollie Boekhouding Verwerken',
  },
  {
    id: 'vendor-bills',
    cadence: 'week',
    title: 'Nieuwe leveranciersfacturen boeken (PDF bijvoegen)',
    categories: ['in_invoice', 'in_refund'],
  },
  {
    id: 'pay-vendors',
    cadence: 'month',
    title: 'Openstaande aankoopfacturen betalen en afletteren',
    categories: ['payment_outbound'],
  },
  {
    id: 'customer-open',
    cadence: 'month',
    title: 'Openstaande klantfacturen nakijken (B2B / stockverkoop)',
    categories: ['out_invoice', 'payment_inbound', 'out_refund'],
  },
  {
    id: 'vat-quarter',
    cadence: 'quarter',
    title: 'Kwartaal: btw-rapport controleren vóór de partner Intervat indient',
    categories: ['vat_entry'],
  },
  {
    id: 'misc',
    cadence: 'month',
    title: 'Diverse boekingen alleen als het geen factuur of banklijn is',
    categories: ['entry'],
  },
];

export function cadenceLabel(cadence: ChecklistItem['cadence']): string {
  switch (cadence) {
    case 'week':
      return 'Wekelijks';
    case 'month':
      return 'Maandelijks';
    case 'quarter':
      return 'Per kwartaal';
    default: {
      const _exhaustive: never = cadence;
      return _exhaustive;
    }
  }
}

/** Highest-impact automations to build next in this app. */
export const AUTOMATION_ROADMAP: Array<{
  title: string;
  impact: string;
  effort: string;
  replaces: ActionCategory[];
}> = [
  {
    title: 'Aankoopfactuur uit leveranciers-PDF',
    impact: 'Hoog — dit is meestal het merendeel van de partner-tijd.',
    effort: 'Middel (PDF-parsers bestaan al; daarna account.move aanmaken).',
    replaces: ['in_invoice', 'in_refund'],
  },
  {
    title: 'PayPal- en Worldline-bankimport (zoals Mollie)',
    impact: 'Hoog — zelfde ritme als Mollie, nu nog manueel of via de partner.',
    effort: 'Laag/middel (Mollie-pad is het sjabloon).',
    replaces: ['bank_statement'],
  },
  {
    title: 'Reconciliatie-voorstellen (factuur ↔ banklijn)',
    impact: 'Hoog — minder klikken in Odoo na import. Voor Mollie is de afschrift + groen/rood-check al gebouwd (Mollie Boekhouding Verwerken); dit item is nu vooral nog voor andere journalen (leveranciers-/klantfacturen ↔ banklijn).',
    effort: 'Middel.',
    replaces: ['bank_statement', 'payment_inbound', 'payment_outbound'],
  },
  {
    title: 'Betaallijst vervallen leveranciers',
    impact: 'Middel — jij beslist, de app maakt de Odoo-betaling klaar.',
    effort: 'Middel.',
    replaces: ['payment_outbound'],
  },
  {
    title: 'Kwartaal-btw-checklist + cijferexport',
    impact: 'Middel — jij controleert, de partner dient in.',
    effort: 'Laag.',
    replaces: ['vat_entry'],
  },
];
