import { supabase } from './lib/supabase';

interface QualityReport {
    report_type: string;
    total_checked: number;
    total_complete: number;
    total_issues: number;
    issues_by_field: Record<string, number>;
    priority_items: any[];
}

async function generateReport() {
    console.log('📊 Generating Data Quality Report...\n');
    console.log('═══════════════════════════════════════════════════════');

    const { data: reports, error } = await supabase
        .from('quality_reports')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(2);

    if (error || !reports || reports.length === 0) {
        console.error('❌ No quality reports found. Run validation scripts first.');
        return;
    }

    const contentReport = reports.find(r => r.report_type === 'content') as QualityReport | undefined;
    const peopleReport = reports.find(r => r.report_type === 'people') as QualityReport | undefined;

    console.log('\n🎯 OVERALL DATA QUALITY\n');

    if (contentReport) {
        const pct = Math.round((contentReport.total_complete / contentReport.total_checked) * 100);
        console.log(`📺 Content:`);
        console.log(`   Total: ${contentReport.total_checked}`);
        console.log(`   Complete: ${contentReport.total_complete} (${pct}%)`);
        console.log(`   Issues: ${contentReport.total_issues} (${100 - pct}%)\n`);
    }

    if (peopleReport) {
        const pct = Math.round((peopleReport.total_complete / peopleReport.total_checked) * 100);
        console.log(`👥 People:`);
        console.log(`   Total: ${peopleReport.total_checked}`);
        console.log(`   Complete: ${peopleReport.total_complete} (${pct}%)`);
        console.log(`   Issues: ${peopleReport.total_issues} (${100 - pct}%)\n`);
    }

    console.log('───────────────────────────────────────────────────────');
    console.log('\n🔴 TOP MISSING FIELDS\n');

    if (contentReport) {
        console.log('Content Issues:');
        Object.entries(contentReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([field, count], idx) => console.log(`  ${idx + 1}. ${field}: ${count} items`));
        console.log('');
    }

    if (peopleReport) {
        console.log('People Issues:');
        Object.entries(peopleReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([field, count], idx) => console.log(`  ${idx + 1}. ${field}: ${count} people`));
        console.log('');
    }

    const totalIssues = (contentReport?.total_issues || 0) + (peopleReport?.total_issues || 0);
    console.log('───────────────────────────────────────────────────────');
    console.log('\n✅ RECOMMENDED ACTIONS\n');
    if (totalIssues > 500) {
        console.log('⚠️  HIGH priority - Run enrichment scripts immediately');
    } else if (totalIssues > 200) {
        console.log('⚡ MEDIUM priority - Schedule enrichment scripts');
    } else {
        console.log('✓ LOW priority - Data quality is good');
    }
    console.log('\n═══════════════════════════════════════════════════════\n');

    generateMarkdownSummary(contentReport, peopleReport);
}

function generateMarkdownSummary(contentReport?: QualityReport, peopleReport?: QualityReport) {
    let md = '# 📊 Data Quality Report\n\n## Summary\n\n';
    md += '| Category | Total | Complete | Issues | Rate |\n|----------|-------|----------|--------|------|\n';

    if (contentReport) {
        const rate = Math.round((contentReport.total_complete / contentReport.total_checked) * 100);
        md += `| 📺 Content | ${contentReport.total_checked} | ${contentReport.total_complete} | ${contentReport.total_issues} | ${rate}% |\n`;
    }
    if (peopleReport) {
        const rate = Math.round((peopleReport.total_complete / peopleReport.total_checked) * 100);
        md += `| 👥 People | ${peopleReport.total_checked} | ${peopleReport.total_complete} | ${peopleReport.total_issues} | ${rate}% |\n`;
    }

    md += '\n## Top Missing Fields\n\n';
    if (contentReport) {
        md += '### Content\n\n';
        Object.entries(contentReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .forEach(([field, count]) => { md += `- **${field}**: ${count} items\n`; });
        md += '\n';
    }
    if (peopleReport) {
        md += '### People\n\n';
        Object.entries(peopleReport.issues_by_field as Record<string, number>)
            .sort((a, b) => b[1] - a[1]).slice(0, 5)
            .forEach(([field, count]) => { md += `- **${field}**: ${count} people\n`; });
        md += '\n';
    }

    md += '## Next Steps\n\nRun enrichment scripts:\n```bash\nnpx tsx scripts/enrich-queue.ts\nnpx tsx scripts/enrich-people.ts\n```\n';

    if (process.env.GITHUB_STEP_SUMMARY) {
        const fs = require('fs');
        fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md);
        console.log('✓ Report added to GitHub Actions step summary');
    }
    console.log('\n' + md);
}

async function main() {
    try {
        await generateReport();
    } catch (error) {
        console.error('❌ Report generation failed:', error);
        process.exit(1);
    }
}

main();
