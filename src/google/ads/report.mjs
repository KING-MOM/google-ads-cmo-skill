// src/google/ads/report.mjs
// Executive report builder — aggregates campaign, keyword, search term, and ad strength data
// into a structured JSON + pre-formatted Spanish executive_text for Telegram/WhatsApp delivery.

import { getCampaigns, getKeywords, getSearchTerms, getAdStrength } from './insights.mjs';

// --------------------------------------------------------------------------
// Trash term detection — low-intent search patterns
// --------------------------------------------------------------------------
const TRASH_PATTERNS = [
  /\bgratis\b/i, /\bempleo\b/i, /\btrabajo\b/i, /\bvacante\b/i, /\bsueldo\b/i,
  /\bfree\b/i, /\bcómo\b/i, /\bcomo hacer\b/i, /\bqué es\b/i, /\bque es\b/i,
  /\bpara qué\b/i, /\bpara que\b/i, /\bsignifica\b/i, /\bdefinición\b/i,
  /\bcurso\b/i, /\baprender\b/i, /\btutorial\b/i, /\bjobs?\b/i,
  /\bcarrera\b/i, /\bcuánto gana\b/i, /\bcuanto gana\b/i, /\byoutube\b/i,
  /\bwikipedia\b/i, /\bblog\b/i
];

function isTrash(term) {
  return TRASH_PATTERNS.some(p => p.test(term));
}

// --------------------------------------------------------------------------
// Number helpers
// --------------------------------------------------------------------------
function micros(v) { return parseFloat(v || 0) / 1_000_000; }

function fmt(n, decimals = 2) {
  return Number(n).toLocaleString('es-MX', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  });
}
function fmtMoney(n) { return `$${fmt(n)}`; }

// --------------------------------------------------------------------------
// Period label
// --------------------------------------------------------------------------
function periodLabel(datePreset, since, until) {
  if (since && until) return `${since} al ${until}`;
  const map = {
    LAST_7_DAYS: 'últimos 7 días',
    LAST_14_DAYS: 'últimos 14 días',
    LAST_30_DAYS: 'últimos 30 días',
    THIS_MONTH: 'este mes',
    LAST_MONTH: 'mes anterior',
    TODAY: 'hoy',
    YESTERDAY: 'ayer'
  };
  return map[datePreset] || datePreset || 'últimos 7 días';
}

// --------------------------------------------------------------------------
// IS value parser — handles '--' (insufficient data) from Google Ads API
// --------------------------------------------------------------------------
function parseIs(v) {
  if (v === '--' || v == null) return null;
  return parseFloat(v) * 100;
}

// --------------------------------------------------------------------------
// Main: buildReport
// --------------------------------------------------------------------------
export async function buildReport({ creds, datePreset = 'LAST_7_DAYS', since, until }) {
  // Parallel fetch — all read-only
  const [campaignRows, keywordRows, searchTermRows, adStrengthRows] = await Promise.all([
    getCampaigns({ creds, datePreset, since, until }),
    getKeywords({ creds, datePreset, since, until }),
    getSearchTerms({ creds, datePreset, since, until }),
    getAdStrength({ creds })
  ]);

  // --------------------------------------------------------------------------
  // Aggregate campaign totals
  // --------------------------------------------------------------------------
  let totalSpend = 0, totalConversions = 0, totalImpressions = 0, totalClicks = 0;
  const isValues = [], budgetLostValues = [];

  const byCampaign = campaignRows.map(row => {
    const spend = micros(row.metrics?.costMicros);
    const conversions = parseFloat(row.metrics?.conversions || 0);
    const impressions = parseFloat(row.metrics?.impressions || 0);
    const clicks = parseFloat(row.metrics?.clicks || 0);
    const ctr = parseFloat(row.metrics?.ctr || 0) * 100;
    const avgCpc = micros(row.metrics?.averageCpc);
    const cpa = conversions > 0 ? spend / conversions : null;
    const is = parseIs(row.metrics?.searchImpressionShare);
    const isLostBudget = parseIs(row.metrics?.searchBudgetLostImpressionShare);
    const isLostRank = parseIs(row.metrics?.searchRankLostImpressionShare);

    totalSpend += spend;
    totalConversions += conversions;
    totalImpressions += impressions;
    totalClicks += clicks;
    if (is != null) isValues.push(is);
    if (isLostBudget != null) budgetLostValues.push(isLostBudget);

    return {
      campaign_id: row.campaign?.id,
      campaign_name: row.campaign?.name,
      status: row.campaign?.status,
      channel: row.campaign?.advertisingChannelType,
      spend, conversions, impressions, clicks, ctr,
      avg_cpc: avgCpc, cpa,
      impression_share_pct: is,
      is_lost_budget_pct: isLostBudget,
      is_lost_rank_pct: isLostRank
    };
  });

  const totalCtr = totalImpressions > 0 ? (totalClicks / totalImpressions) * 100 : 0;
  const totalCpa = totalConversions > 0 ? totalSpend / totalConversions : null;
  const totalAvgCpc = totalClicks > 0 ? totalSpend / totalClicks : 0;
  const avgIs = isValues.length > 0 ? isValues.reduce((a, b) => a + b, 0) / isValues.length : null;
  const avgBudgetLost = budgetLostValues.length > 0
    ? budgetLostValues.reduce((a, b) => a + b, 0) / budgetLostValues.length : null;

  // --------------------------------------------------------------------------
  // Quality score from keywords
  // --------------------------------------------------------------------------
  const qsValues = keywordRows
    .map(r => r.adGroupCriterion?.qualityInfo?.qualityScore)
    .filter(v => v != null && v > 0);
  const avgQs = qsValues.length > 0
    ? qsValues.reduce((a, b) => a + b, 0) / qsValues.length : null;

  // Winning keywords: conversions > 0, sorted by CPA ascending
  const winningKeywords = keywordRows
    .map(r => {
      const spend = micros(r.metrics?.costMicros);
      const conv = parseFloat(r.metrics?.conversions || 0);
      return {
        keyword: r.adGroupCriterion?.keyword?.text,
        match_type: r.adGroupCriterion?.keyword?.matchType,
        campaign: r.campaign?.name,
        ad_group: r.adGroup?.name,
        ad_group_id: r.adGroup?.id,
        criterion_id: r.adGroupCriterion?.criterionId,
        quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore,
        spend, conversions: conv,
        cpa: conv > 0 ? spend / conv : null,
        ctr_pct: parseFloat(r.metrics?.ctr || 0) * 100,
        avg_cpc: micros(r.metrics?.averageCpc),
        impressions: parseFloat(r.metrics?.impressions || 0)
      };
    })
    .filter(k => k.conversions > 0)
    .sort((a, b) => a.cpa - b.cpa);

  // Low-QS keywords: quality_score <= 4, with spend
  const lowQsKeywords = keywordRows
    .filter(r => {
      const qs = r.adGroupCriterion?.qualityInfo?.qualityScore;
      return qs != null && qs <= 4 && micros(r.metrics?.costMicros) > 0;
    })
    .map(r => ({
      keyword: r.adGroupCriterion?.keyword?.text,
      campaign: r.campaign?.name,
      quality_score: r.adGroupCriterion?.qualityInfo?.qualityScore,
      spend: micros(r.metrics?.costMicros)
    }));

  // --------------------------------------------------------------------------
  // Search terms
  // --------------------------------------------------------------------------
  const allTerms = searchTermRows.map(r => ({
    term: r.searchTermView?.searchTerm,
    campaign: r.campaign?.name,
    ad_group: r.adGroup?.name,
    impressions: parseFloat(r.metrics?.impressions || 0),
    clicks: parseFloat(r.metrics?.clicks || 0),
    cost: micros(r.metrics?.costMicros),
    conversions: parseFloat(r.metrics?.conversions || 0),
    cpa: parseFloat(r.metrics?.conversions || 0) > 0
      ? micros(r.metrics?.costMicros) / parseFloat(r.metrics?.conversions)
      : null
  }));

  const trashTerms = allTerms.filter(t => isTrash(t.term));
  const topTerms = allTerms
    .filter(t => t.conversions > 0)
    .sort((a, b) => b.conversions - a.conversions)
    .slice(0, 10);

  // Zero-conversion terms with significant spend (> 2x avg CPA or > 100 if no CPA)
  const spendThreshold = totalCpa ? totalCpa * 2 : 100;
  const wastedTerms = allTerms.filter(t => t.conversions === 0 && t.cost > spendThreshold);

  // --------------------------------------------------------------------------
  // Ad strength summary
  // --------------------------------------------------------------------------
  const adStrengthSummary = {};
  for (const row of adStrengthRows) {
    const s = row.adGroupAd?.adStrength || 'UNKNOWN';
    adStrengthSummary[s] = (adStrengthSummary[s] || 0) + 1;
  }
  const poorAds = adStrengthRows
    .filter(r => ['POOR', 'NO_ADS', 'PENDING'].includes(r.adGroupAd?.adStrength))
    .map(r => ({
      campaign: r.campaign?.name,
      ad_group: r.adGroup?.name,
      strength: r.adGroupAd?.adStrength
    }));

  // Underperforming campaigns: spend > 2x avg CPA, 0 conversions
  const underperformers = byCampaign.filter(c => c.conversions === 0 && c.spend > spendThreshold);
  // Best campaign by CPA
  const topCampaign = byCampaign.filter(c => c.cpa != null).sort((a, b) => a.cpa - b.cpa)[0];

  // --------------------------------------------------------------------------
  // Build executive_text (Spanish, Telegram-ready)
  // --------------------------------------------------------------------------
  const period = periodLabel(datePreset, since, until);
  const lines = [];

  lines.push('Diagnóstico de Desempeño: Google Ads');
  lines.push(`Período: ${period}`);
  lines.push('');
  lines.push('Métricas Críticas de Negocio:');
  lines.push('');
  lines.push(`Inversión Realizada: ${fmtMoney(totalSpend)} MXN`);
  lines.push(`Conversiones (Leads): ${Math.round(totalConversions)}`);
  lines.push(`Costo por Lead (CPA): ${totalCpa != null ? fmtMoney(totalCpa) : 'Sin conversiones'}`);
  lines.push(`CTR (Tasa de Clic): ${fmt(totalCtr)}%`);
  lines.push(`CPC Promedio: ${fmtMoney(totalAvgCpc)}`);
  lines.push(`Impresiones: ${Math.round(totalImpressions).toLocaleString('es-MX')}`);
  lines.push(`IS (Cuota de Impresiones): ${avgIs != null ? fmt(avgIs, 1) + '%' : 'N/D'}`);
  lines.push(`Nivel de Calidad Promedio: ${avgQs != null ? fmt(avgQs, 1) + '/10' : 'N/D'}`);

  lines.push('');
  lines.push('Diagnóstico de Intención:');
  lines.push('');

  if (winningKeywords.length > 0) {
    const top2 = winningKeywords.slice(0, 2);
    const kwDesc = top2.map(k => `"${k.keyword}" (CPA: ${fmtMoney(k.cpa)})`).join(' y ');
    lines.push(`Palabras Clave Ganadoras: ${kwDesc} concentran el mayor volumen de conversiones con el CPA más bajo.`);
  } else {
    lines.push('Palabras Clave Ganadoras: Sin conversiones registradas en el período.');
  }

  if (topTerms.length > 0) {
    const termList = topTerms.slice(0, 3).map(t => `"${t.term}"`).join(', ');
    lines.push(`Términos de Búsqueda Críticos: ${termList} generan la mayoría de conversiones.`);
  }

  const negativeOpportunities = [...new Set([...trashTerms, ...wastedTerms])];
  if (negativeOpportunities.length > 0) {
    const trashCost = trashTerms.reduce((a, b) => a + b.cost, 0);
    lines.push(`Oportunidad de Negativas: ${negativeOpportunities.length} términos de baja intención detectados (gasto desperdiciado: ${fmtMoney(trashCost)} MXN). Añadir como negativas para recuperar presupuesto.`);
  } else {
    lines.push('Oportunidad de Negativas: No se detectaron términos de baja intención evidentes.');
  }

  lines.push('');
  lines.push('Diagnóstico de Comunicación:');
  lines.push('');

  const excellent = adStrengthSummary['EXCELLENT'] || 0;
  const good = adStrengthSummary['GOOD'] || 0;
  const poor = (adStrengthSummary['POOR'] || 0) + (adStrengthSummary['NO_ADS'] || 0);
  if (excellent + good + poor > 0) {
    lines.push(`Fuerza de Anuncios: ${excellent} EXCELLENT, ${good} GOOD, ${poor} POOR/SIN ANUNCIOS.`);
  }
  if (topCampaign) {
    lines.push(`Campaña más eficiente: "${topCampaign.campaign_name}" con CPA de ${fmtMoney(topCampaign.cpa)} MXN.`);
  }
  if (lowQsKeywords.length > 0) {
    lines.push(`Nivel de Calidad crítico: ${lowQsKeywords.length} keyword(s) con QS ≤ 4 activas. Revisar relevancia anuncio-keyword-landing.`);
  }

  lines.push('');
  lines.push('Decisiones Clave Recomendadas:');
  lines.push('');

  if (topCampaign && totalCpa != null && topCampaign.cpa < totalCpa * 0.8) {
    const diff = fmt((1 - topCampaign.cpa / totalCpa) * 100, 0);
    lines.push(`Escalamiento de Intención: Incrementar inversión en "${topCampaign.campaign_name}" (CPA ${fmtMoney(topCampaign.cpa)}) — opera ${diff}% por debajo del CPA promedio.`);
  } else {
    lines.push('Escalamiento de Intención: Mantener estructura actual. Evaluar incremento si el CPA se estabiliza por debajo del objetivo.');
  }

  if (negativeOpportunities.length > 0) {
    lines.push(`Limpieza de Tráfico: Añadir ${Math.min(negativeOpportunities.length, 10)} palabras negativas. Priorizar términos con mayor gasto y 0 conversiones.`);
  }

  if (underperformers.length > 0) {
    const names = underperformers.map(c => `"${c.campaign_name}"`).join(', ');
    lines.push(`Optimización de Presupuesto: ${names} — gasto > 2x CPA objetivo con 0 conversiones. Pausar o revisar targeting.`);
  }

  if (poorAds.length > 0) {
    lines.push(`Optimización de Anuncio: Mejorar ${poorAds.length} anuncio(s) con fuerza POOR añadiendo títulos únicos y variaciones de descripción.`);
  }

  lines.push('');
  lines.push('Riesgos por Mitigar:');
  lines.push('');

  if (avgBudgetLost != null && avgBudgetLost > 10) {
    lines.push(`Pérdida por Presupuesto: Perdemos ~${fmt(avgBudgetLost, 1)}% de impresiones por limitación de fondos diarios. Aumentar presupuesto para capturar esa demanda.`);
  } else {
    lines.push('Pérdida por Presupuesto: IS perdida por presupuesto en niveles aceptables.');
  }

  if (avgQs != null && avgQs < 6) {
    lines.push(`Calidad de Cuenta: QS promedio ${fmt(avgQs, 1)}/10 por debajo del estándar (7+). El bajo QS eleva el CPC y reduce la visibilidad.`);
  }

  if (poorAds.length > 2) {
    lines.push(`Fatiga de Texto: ${poorAds.length} anuncio(s) con fuerza POOR. Riesgo de CTR estancado si no se actualizan los creativos.`);
  }

  lines.push('Canibalización: Verificar manualmente si se está pujando por términos de marca propia. Usar search-terms.report para revisar.');

  // --------------------------------------------------------------------------
  // Return structured result
  // --------------------------------------------------------------------------
  return {
    period,
    currency: 'MXN',
    totals: {
      spend: totalSpend,
      conversions: totalConversions,
      cpa: totalCpa,
      ctr_pct: totalCtr,
      avg_cpc: totalAvgCpc,
      impressions: totalImpressions,
      avg_impression_share_pct: avgIs,
      avg_budget_lost_is_pct: avgBudgetLost,
      avg_quality_score: avgQs
    },
    by_campaign: byCampaign,
    winning_keywords: winningKeywords.slice(0, 10),
    low_qs_keywords: lowQsKeywords,
    top_search_terms: topTerms,
    trash_search_terms: trashTerms,
    wasted_terms: wastedTerms.slice(0, 20),
    underperformers,
    ad_strength_summary: adStrengthSummary,
    poor_ads: poorAds,
    executive_text: lines.join('\n')
  };
}
