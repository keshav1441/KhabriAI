/**
 * Catalyst Function: /insights
 * Runs proactive anomaly detection queries.
 * Env vars required:
 *   DATABASE_URL — Supabase PostgreSQL connection string
 */

const { PrismaClient } = require("@prisma/client");

module.exports = async (req, res) => {
  const prisma = new PrismaClient();
  const insights = [];

  try {
    // Spike detection
    const spikes = await prisma.$queryRaw`
      SELECT district,
        COUNT(*) FILTER (WHERE date >= DATE_TRUNC('month', NOW())) AS this_month,
        COUNT(*) FILTER (WHERE date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')
                           AND date <  DATE_TRUNC('month', NOW())) AS last_month
      FROM "Incident"
      GROUP BY district
      HAVING COUNT(*) FILTER (WHERE date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND date < DATE_TRUNC('month', NOW())) > 5
        AND COUNT(*) FILTER (WHERE date >= DATE_TRUNC('month', NOW()))
          > COUNT(*) FILTER (WHERE date >= DATE_TRUNC('month', NOW() - INTERVAL '1 month') AND date < DATE_TRUNC('month', NOW())) * 1.4
      ORDER BY this_month DESC LIMIT 3
    `;
    for (const r of spikes) {
      const thisMonth = Number(r.this_month), lastMonth = Number(r.last_month);
      const pct = lastMonth > 0 ? Math.round(((thisMonth - lastMonth) / lastMonth) * 100) : 0;
      insights.push({ type: "spike", title: `Crime spike in ${r.district}`, detail: `${pct}% increase this month`, query: `Show crime breakdown in ${r.district} for the last 2 months` });
    }

    // Repeat suspects
    const repeats = await prisma.$queryRaw`
      SELECT p.name, COUNT(DISTINCT pi."incidentId") AS case_count, STRING_AGG(DISTINCT i."crimeType", ', ') AS crime_types
      FROM "Person" p
      JOIN "PersonIncident" pi ON pi."personId" = p.id
      JOIN "Incident" i ON i.id = pi."incidentId"
      WHERE p.role = 'suspect' AND i.date >= NOW() - INTERVAL '30 days'
      GROUP BY p.id, p.name HAVING COUNT(DISTINCT pi."incidentId") >= 3
      ORDER BY case_count DESC LIMIT 2
    `;
    for (const r of repeats) {
      insights.push({ type: "repeat_suspect", title: `Repeat suspect: ${r.name}`, detail: `${Number(r.case_count)} cases in 30 days (${r.crime_types})`, query: `Show cases linked to suspect ${r.name}` });
    }
  } catch (e) {
    console.error("Insights error:", e.message);
  } finally {
    await prisma.$disconnect();
  }

  res.json({ insights });
};
