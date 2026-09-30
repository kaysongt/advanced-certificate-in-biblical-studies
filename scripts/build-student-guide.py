"""Build the student-facing launch guide. Run with the bundled Python runtime."""
from pathlib import Path
from reportlab.lib import colors
from reportlab.lib.enums import TA_LEFT
from reportlab.lib.styles import ParagraphStyle
from reportlab.lib.pagesizes import A4
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, PageBreak, KeepTogether

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "output" / "pdf" / "KTI-Student-Quick-Start-Guide.pdf"
OUT.parent.mkdir(parents=True, exist_ok=True)
NAVY = colors.HexColor("#102c4a")
GOLD = colors.HexColor("#b4872d")
INK = colors.HexColor("#263b4e")
MUTED = colors.HexColor("#596b78")
CREAM = colors.HexColor("#f5f1e8")
styles = {
    "title": ParagraphStyle("title", fontName="Helvetica-Bold", fontSize=27, leading=31, textColor=NAVY, spaceAfter=15),
    "sub": ParagraphStyle("sub", fontName="Helvetica", fontSize=12, leading=18, textColor=MUTED, spaceAfter=18),
    "h": ParagraphStyle("h", fontName="Helvetica-Bold", fontSize=13, leading=17, textColor=NAVY, spaceBefore=10, spaceAfter=6, keepWithNext=True),
    "body": ParagraphStyle("body", fontName="Helvetica", fontSize=10.5, leading=14.5, textColor=INK, spaceAfter=8),
    "small": ParagraphStyle("small", fontName="Helvetica", fontSize=9.5, leading=14, textColor=MUTED, spaceAfter=7),
    "box": ParagraphStyle("box", fontName="Helvetica", fontSize=10.5, leading=15, textColor=NAVY),
    "cell": ParagraphStyle("cell", fontName="Helvetica", fontSize=10.5, leading=15, textColor=INK),
}
story = []
def p(text, style="body"):
    story.append(Paragraph(text, styles[style]))
def heading(title, subtitle):
    p(title, "title"); p(subtitle, "sub")
def step(number, title, body):
    story.append(KeepTogether([Paragraph(f"{number:02d}  {title}", styles["h"]), Paragraph(body, styles["body"])]))
def box(text):
    t = Table([[Paragraph(text, styles["box"])]], colWidths=[475])
    t.setStyle(TableStyle([("BACKGROUND", (0,0), (-1,-1), CREAM), ("BOX", (0,0), (-1,-1), 0.6, GOLD), ("LEFTPADDING", (0,0), (-1,-1), 13), ("RIGHTPADDING", (0,0), (-1,-1), 13), ("TOPPADDING", (0,0), (-1,-1), 12), ("BOTTOMPADDING", (0,0), (-1,-1), 12)]))
    story.extend([t, Spacer(1, 12)])
def link(url, label):
    return f'<link href="{url}" color="#165a83"><u>{label}</u></link>'
def newpage(): story.append(PageBreak())

heading("Your first day at KTI", "A simple guide for students using the Bible School platform for the first time.")
box("<b>Module 1: Systematic Theology</b><br/>Opens Thursday, 1 October 2026 at <b>12:00 noon WAT</b> (Nigeria time). This is 11:00 a.m. UTC. Before this time, an opening notice is normal.")
step(1, "Open the website", f"Use a phone, tablet or computer with an internet connection. Open {link('https://www.thekti.org/login?next=%2Fdashboard', 'www.thekti.org/login')} in your browser. You do not need to install an app.")
step(2, "Sign in to your existing account", "Enter the email address you used to register and your password, then select <b>Sign in</b>. Use your own account so your progress is saved correctly. Do not register again just because you forgot your password.")
step(3, "Go to My studies", "Open <b>My studies</b>. Look for <b>Your program</b>, then <b>Module 1 - Systematic Theology</b>. At the opening time, select <b>Start studying</b>. You can also use the <b>Open Module 1</b> link in the access notice.")
step(4, "Open a course and its first lesson", "Choose a course from Module 1, then select its first topic under <b>Topics</b>. A topic is a lesson. Read the teaching material before starting the timed lesson quiz.")
box("<b>Quick route</b><br/>Sign in &gt; My studies &gt; Systematic Theology &gt; Course &gt; Topic 1")
p("Already registered but cannot sign in? See password recovery on page 5. On a small screen, use Menu or scroll down to find the section you need.", "small")

newpage()
heading("Find your study materials", "The module groups related courses together. Each course has its own lessons, book and assessment.")
step(1, "Read the course overview", "The course page introduces what you will study and lists its topics. Start with topic 1 and work through the lessons in order. Locked topics are not an error: they open after the earlier lessons are completed.")
step(2, "Read or download your textbook", "Find <b>Included textbook</b>. Select <b>Read book</b> to open it online, or <b>Download PDF</b> to save it. A new Google Drive tab may open. If the PDF opens in a viewer, use that viewer's download button.")
box("<b>Large downloads</b><br/>Some textbooks are large. Use a stable connection, preferably Wi-Fi, and allow time for the file to load. Google Drive may display a large-file warning. Only continue with the Institute-supplied file you intended to download.")
step(3, "Listen to the audiobook", "On the course page, find <b>Listen chapter by chapter</b>. Open the chapter you want and use its audio player. If the player will not load, select <b>Open the complete audio folder</b> and open the chapter in Google Drive.")
step(4, "Return to your lesson", "After reading or listening in another tab, return to the KTI tab. Downloading a book or listening to audio does not automatically complete a lesson. You still need to pass its quiz and select <b>Mark complete</b>.")
p("Useful habits", "h")
p("Keep notes as you read. Use the course and module links above the lesson to return to the overview. Sign in with the same account when you change devices. Completed lessons are saved to your account; an unfinished quiz's answers may not survive a refresh.")
p("You may read a downloaded PDF offline. Sign-in, quizzes, saving progress and discussions require an internet connection.", "small")

newpage()
heading("Complete a lesson", "Read first. Start the timer only when you are ready to answer.")
box("<b>Lesson quiz rules</b><br/><b>Time limit:</b> 5 minutes<br/><b>Pass mark:</b> 80% or higher<br/><b>After a failed or timed-out attempt:</b> wait 1 hour before trying again.")
step(1, "Read all the lesson material", "Work through the teaching, Scriptures and examples. When you reach <b>Lesson assessment</b>, read the rules before beginning. The timer has not started yet.")
step(2, "Start the lesson quiz", "Select <b>Start / resume lesson quiz</b>. Your 5-minute timer begins on the server. Answer every question. Your answers are submitted for verification automatically when you answer the final question.")
step(3, "Wait for your verified result", "Do not close the page while your result is being saved. You need a verified score of <b>80% or higher</b>. If you fail, the page shows when your next attempt becomes available in WAT. Use the waiting period to review the lesson.")
step(4, "Mark the lesson complete", "After a verified pass, select <b>Mark complete</b>. Wait for the page to confirm <b>Topic complete</b>, then use <b>Next</b> to continue. Passing the quiz alone is not the final step: you must mark the lesson complete.")
box("<b>The clock keeps running</b><br/>Refreshing, changing tabs, closing the page or losing your connection does not pause or reset the timer. If time runs out, the attempt fails even if you have not answered every question. Select Start / resume to resume an attempt that is still running.")
p("If the next lesson is locked", "h")
p("Return to the earliest unfinished lesson. Check that you passed its quiz and selected Mark complete. Every earlier lesson must be complete; you cannot skip ahead by opening a direct link.")

newpage()
heading("Take the course assessment", "The final assessment opens only after every lesson in that course is complete.")
box("<b>Course assessment - Section A</b><br/><b>Questions:</b> 20, drawn from that course's question bank<br/><b>Time limit:</b> 15 minutes<br/><b>New attempts:</b> at least 24 hours apart, measured from the previous start time.")
step(1, "Finish all the topics", "Return to the course page and check that each topic is marked <b>Done</b>. Select <b>Course Assessment</b>. If it is locked, complete the remaining lessons first.")
step(2, "Start when you are ready", "Read the assessment instructions. Select <b>Start / resume course assessment</b> to reveal the questions and begin the timer. Keep a stable internet connection and allow yourself the full 15 minutes.")
step(3, "Submit before time runs out", "Answer all 20 questions, then select <b>Submit Section A</b> before the timer reaches zero. Unlike lesson quizzes, this section has a separate submit button. Wait for the saved-result confirmation.")
step(4, "Complete the written sections", "After Section A is saved, follow the prompts for the written work and submit it for instructor review. The 15-minute timer applies only to the 20-question section, not the written sections. The overall course pass mark is <b>80%</b>; the final result includes instructor-marked work.")
box("<b>If time runs out</b><br/>The attempt automatically fails; partial answers do not rescue a timed-out attempt. You cannot start a new course attempt until 24 hours after the previous one began. The page shows the next available time. Refreshing does not bypass this rule.")
p("Retakes and results", "h")
p("A permitted retake draws from the same course's question bank and prioritizes questions not used in your previous attempt. If your written work is awaiting review, wait for the instructor's result instead of starting again. Keep a separate copy of longer written responses before submitting.")

newpage()
heading("Access, discussion and help", "Keep this page handy if you are unsure what to do next.")
p("Who can study?", "h")
p("<b>Module 1:</b> all registered students can begin at the opening time without paying tuition upfront. <b>Module 2 and later:</b> access requires payment, a verified minister waiver, or an approved scholarship covering the module. Arrange payment before Module 2 opens on <b>1 December 2026 at 12:00 noon WAT</b>. A pending scholarship application is not an approved award. If you have already been cleared, do not pay again; ask KTI to check your account.")
p("Join a lesson discussion", "h")
p("Below each lesson, find <b>Discuss this lesson</b>. Write a question or an insight in <b>Add to the discussion</b>, then select <b>Share with the group</b>. Keep posts respectful and do not share quiz answers or private information. Discussion is optional and is not live chat. Reload the page later to see new responses.")
p("Forgot your password?", "h")
p(f"Open {link('https://www.thekti.org/forgot-password', 'www.thekti.org/forgot-password')}. Enter your registered email and request a reset link. Check your inbox and spam/junk folder. Open the email link promptly, choose a new password, then return to Sign in. Reset links expire after 30 minutes and can only be used once. Request another if yours expires.")
p("Quick troubleshooting", "h")
p("<b>Module 1 still says locked?</b> Check the date and noon-WAT opening time, confirm you are signed in, then refresh.<br/><b>Next lesson locked?</b> Pass the earlier quiz and select Mark complete.<br/><b>Retry blocked?</b> Wait until the time shown; changing devices will not shorten the cooldown.<br/><b>Book or audio not loading?</b> Try the Google Drive link and check your connection.<br/><b>Payment or scholarship not reflected?</b> Ask KTI to verify clearance before paying again.")
box(f"<b>Need help?</b><br/>Email {link('mailto:kti@kingsword.org', 'kti@kingsword.org')}. Include your full name, registered email, course/topic, the exact message and a screenshot if possible. <b>Never send your password or reset link.</b>")
p("Student guide | Prepared 30 September 2026 | All opening and retry times in this guide use WAT (Nigeria time).", "small")

def furniture(canvas, doc):
    w, h = A4
    canvas.setFillColor(NAVY); canvas.rect(0, h-44, w, 44, fill=1, stroke=0)
    canvas.setFillColor(colors.white); canvas.setFont("Helvetica-Bold", 10)
    canvas.drawString(60, h-28, "KTI  /  KINGSWORD TRAINING INSTITUTE")
    canvas.setStrokeColor(GOLD); canvas.setLineWidth(1); canvas.line(60, 48, w-60, 48)
    canvas.setFillColor(MUTED); canvas.setFont("Helvetica", 9)
    canvas.drawString(60, 32, "STUDENT QUICK START  |  OCTOBER 2026")
    canvas.drawRightString(w-60, 32, f"{doc.page} / 5")

doc = SimpleDocTemplate(str(OUT), pagesize=A4, leftMargin=60, rightMargin=60, topMargin=68, bottomMargin=65, title="KTI Student Quick Start Guide", author="KingsWord Training Institute")
doc.build(story, onFirstPage=furniture, onLaterPages=furniture)
print(OUT)
