import { jsPDF } from 'jspdf'
import autoTable from 'jspdf-autotable'
import type { ReportCard } from '../../shared/api/types'

function money(value: string | number) {
  return Number(value).toLocaleString('en-GH', { minimumFractionDigits: 1, maximumFractionDigits: 1 })
}

export function downloadReportCardPdf(card: ReportCard) {
  const pdf = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
  const width = pdf.internal.pageSize.getWidth()
  const margin = 16
  pdf.setFillColor(29, 63, 144)
  pdf.rect(0, 0, width, 48, 'F')
  pdf.setFillColor(53, 121, 255)
  pdf.rect(0, 45, width, 3, 'F')
  pdf.setTextColor(255, 255, 255)
  pdf.setFont('helvetica', 'bold')
  pdf.setFontSize(20)
  pdf.text(card.school_name || 'School report', margin, 19, { maxWidth: width - margin * 2 })
  pdf.setFont('helvetica', 'normal')
  pdf.setFontSize(10)
  pdf.text('ACADEMIC REPORT CARD', margin, 29)
  pdf.setFontSize(9)
  pdf.text(`${card.academic_year_name}  ·  ${card.term_name}`, margin, 36)
  pdf.text(`${new Date(card.term_starts_on).toLocaleDateString('en-GB')} – ${new Date(card.term_ends_on).toLocaleDateString('en-GB')}`, width - margin, 36, { align: 'right' })

  let y = 60
  const studentWidth = (width - margin * 2 - 8) / 2
  const info = [
    ['STUDENT', `${card.first_name} ${card.last_name}`],
    ['ADMISSION NUMBER', card.admission_number],
    ['CLASS', `${card.class_name}${card.class_stream ? ` · ${card.class_stream}` : ''}`],
    ['GRADING SCALE', card.grading_scale_name || '—'],
  ]
  info.forEach(([label, value], index) => {
    const x = margin + (index % 2) * (studentWidth + 8)
    const rowY = y + Math.floor(index / 2) * 22
    pdf.setFillColor(246, 248, 252)
    pdf.roundedRect(x, rowY - 5, studentWidth, 18, 2, 2, 'F')
    pdf.setTextColor(108, 124, 149)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.text(label, x + 4, rowY)
    pdf.setTextColor(36, 54, 83)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(10)
    pdf.text(String(value), x + 4, rowY + 7, { maxWidth: studentWidth - 8 })
  })
  y += 50

  autoTable(pdf, {
    startY: y,
    head: [['SUBJECT', 'CODE', 'TERM SCORE', 'GRADE', 'POINTS', 'ASSESSMENTS']],
    body: card.subjects.map(subject => [subject.subject_name, subject.subject_code,
      `${money(subject.weighted_total)}%`, subject.grade ?? '—',
      subject.points === null ? '—' : money(subject.points), String(subject.assessment_count)]),
    theme: 'grid',
    margin: { left: margin, right: margin },
    styles: { font: 'helvetica', fontSize: 8.5, cellPadding: 3, textColor: [48, 64, 90], lineColor: [226, 232, 241], lineWidth: .2 },
    headStyles: { fillColor: [239, 243, 251], textColor: [54, 73, 106], fontStyle: 'bold', fontSize: 7.5 },
    alternateRowStyles: { fillColor: [250, 251, 253] },
    columnStyles: { 0: { cellWidth: 54 }, 1: { cellWidth: 22 }, 2: { halign: 'right' }, 3: { halign: 'center' }, 4: { halign: 'right' }, 5: { halign: 'center' } },
    didDrawPage: () => {
      const pageHeight = pdf.internal.pageSize.getHeight()
      pdf.setDrawColor(224, 230, 239)
      pdf.line(margin, pageHeight - 14, width - margin, pageHeight - 14)
      pdf.setFont('helvetica', 'normal')
      pdf.setFontSize(8)
      pdf.setTextColor(123, 136, 157)
      pdf.text('Acadex · Official term results', margin, pageHeight - 8)
      pdf.text(`Generated ${new Date().toLocaleDateString('en-GB')}`, width - margin, pageHeight - 8, { align: 'right' })
    },
  })
  const finalY = (pdf as jsPDF & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y
  let summaryY = Math.min(finalY + 13, pdf.internal.pageSize.getHeight() - 54)
  if (finalY + 58 > pdf.internal.pageSize.getHeight() - 15) {
    pdf.addPage()
    summaryY = 24
  }
  pdf.setFillColor(241, 245, 253)
  pdf.roundedRect(margin, summaryY, width - margin * 2, 29, 2, 2, 'F')
  const metrics = [
    ['TERM AVERAGE', `${money(card.aggregate_percent)}%`], ['OVERALL GRADE', card.aggregate_grade ?? '—'],
    ['CLASS POSITION', card.position === null ? '—' : `${card.position} of ${card.class_size}`],
  ]
  metrics.forEach(([label, value], index) => {
    const cellWidth = (width - margin * 2) / metrics.length
    const x = margin + index * cellWidth + cellWidth / 2
    pdf.setTextColor(91, 109, 140)
    pdf.setFont('helvetica', 'bold')
    pdf.setFontSize(7.5)
    pdf.text(label, x, summaryY + 10, { align: 'center' })
    pdf.setTextColor(36, 58, 98)
    pdf.setFontSize(15)
    pdf.text(value, x, summaryY + 21, { align: 'center' })
  })
  const filename = `${card.admission_number}-${card.academic_year_name}-${card.term_name}-report-card.pdf`.replace(/[^a-zA-Z0-9._-]+/g, '-')
  pdf.save(filename)
}
