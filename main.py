from fastapi import FastAPI, UploadFile, File, Form
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import uvicorn
import docx2txt
from PyPDF2 import PdfReader
from typing import Optional

app = FastAPI(title="Smart Resume Evaluator")

# ---------- CORS Middleware ----------
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # You can restrict to ["http://127.0.0.1:5500"] if serving with VS Code Live Server
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ---------- Utility Functions ----------
def extract_text_from_resume(file: UploadFile):
    """Extract text from PDF or DOCX resume"""
    if file.filename.endswith(".pdf"):
        reader = PdfReader(file.file)
        text = ""
        for page in reader.pages:
            text += page.extract_text() or ""
        return text
    elif file.filename.endswith(".docx"):
        with open("temp.docx", "wb") as f:
            f.write(file.file.read())
        text = docx2txt.process("temp.docx")
        return text
    else:
        raise ValueError("Unsupported file type. Use PDF or DOCX.")

def extract_skills(text):
    """Basic skills extraction using keyword matching"""
    SKILLS_DB = ["Python", "SQL", "Excel", "Java", "C++", "Machine Learning",
                 "Deep Learning", "NLP", "Data Analysis", "Tableau", "Power BI",
                 "Agile", "Scrum", "Azure", "AWS", "Linux", "R", "Networking"]
    text = text.lower()
    found_skills = [skill for skill in SKILLS_DB if skill.lower() in text]
    return found_skills

def match_skills(resume_skills, jd_skills):
    matched = list(set(resume_skills) & set(jd_skills))
    missing = list(set(jd_skills) - set(resume_skills))
    match_score = int(len(matched) / len(jd_skills) * 100) if jd_skills else 0
    return match_score, matched, missing

def ats_check(resume_text, jd_text):
    """Simple ATS simulation"""
    jd_keywords = extract_skills(jd_text)
    resume_keywords = extract_skills(resume_text)
    matched = len(set(jd_keywords) & set(resume_keywords))
    total = len(jd_keywords) if jd_keywords else 1
    ats_score = int((matched / total) * 100)

    feedback = []
    if ats_score < 50:
        feedback.append("Resume is missing many keywords from JD.")
    if ats_score < 70:
        feedback.append("Consider including relevant skills and certifications.")
    if ats_score >= 70:
        feedback.append("Resume is ATS-friendly.")

    return ats_score, " ".join(feedback)

# ---------- Database ----------
JOBS_DB = {
    "Data Analyst": ["Python", "SQL", "Excel", "Tableau", "Power BI"],
    "Data Scientist": ["Python", "R", "Machine Learning", "Deep Learning", "NLP"],
    "Business Analyst": ["SQL", "Excel", "Power BI", "Agile", "Scrum"],
    "Software Engineer": ["Java", "C++", "Python", "Agile", "Scrum"],
    "Software Developer": ["Java", "Python", "SQL", "Agile", "Scrum"],
    "Machine Learning Engineer": ["Python", "Machine Learning", "Deep Learning", "NLP", "Azure", "AWS"],
    "Cloud Engineer": ["AWS", "Azure", "Python", "Linux"],
    "AI Engineer": ["Python", "Machine Learning", "Deep Learning", "NLP", "Azure", "AWS"],
    "DevOps Engineer": ["AWS", "Azure", "Linux", "Agile", "Scrum"],
    "Cybersecurity Analyst": ["Linux", "SQL", "Python", "Networking"],
}

LEARNING_RESOURCES = {
    "Python": "https://nptel.ac.in/courses/106/106/106106182/",
    "SQL": "https://youtu.be/27axs9dO7AE",
    "Excel": "https://youtu.be/mAwb07iR4Jw",
    "Tableau": "https://nasscom.in/knowledge-center/courses/tableau",
    "Power BI": "https://nasscom.in/knowledge-center/courses/power-bi",
    "Machine Learning": "https://nptel.ac.in/courses/106/106/106106202/",
    "Deep Learning": "https://nptel.ac.in/courses/106/106/106106213/",
    "NLP": "https://nptel.ac.in/courses/106/106/106106211/",
    "Agile": "https://youtu.be/Z9QbYZh1YXY",
    "Scrum": "https://youtu.be/9TycLR0TqFA",
    "Azure": "https://nasscom.in/knowledge-center/courses/microsoft-azure",
    "AWS": "https://youtu.be/ulprqHHWlng",
    "Java": "https://nptel.ac.in/courses/106/106/106106145/",
    "R": "https://nptel.ac.in/courses/106/106/106106212/"
}

# ---------- FastAPI Endpoint ----------
@app.post("/analyze-resume-vs-job/")
async def analyze_resume_vs_job(
    resume: UploadFile = File(...),
    jd_text: Optional[str] = Form(None),
    job_title: Optional[str] = Form(None)
):
    try:
        resume_text = extract_text_from_resume(resume)
        resume_skills = extract_skills(resume_text)

        required_skills = []

        # Use job description if provided
        if jd_text:
            jd_skills = extract_skills(jd_text)
            required_skills.extend(jd_skills)
        else:
            jd_skills = []

        # Use job title if provided
        if job_title and job_title in JOBS_DB:
            required_skills.extend(JOBS_DB[job_title])

        required_skills = list(set(required_skills))

        match_score, matched_skills, missing_skills = match_skills(resume_skills, required_skills)
        ats_score, ats_feedback = ats_check(resume_text, jd_text or "")

        # Job recommendation
        best_job = None
        best_match_count = -1
        for job, skills in JOBS_DB.items():
            overlap = len(set(resume_skills) & set(skills))
            if overlap > best_match_count:
                best_match_count = overlap
                best_job = job

        # Missing skills with resources
        missing_with_resources = []
        for skill in missing_skills:
            missing_with_resources.append({
                "skill": skill,
                "resource": LEARNING_RESOURCES.get(skill, "Search online for free resources")
            })

        return JSONResponse(content={
            "match_score": match_score,
            "matched_skills": matched_skills,
            "missing_skills": missing_skills,
            "missing_with_resources": missing_with_resources,
            "suggested_job": best_job,
            "ats_score": ats_score,
            "ats_feedback": ats_feedback
        })
    except Exception as e:
        return JSONResponse(content={"error": str(e)}, status_code=400)

# ---------- Run Server ----------
if __name__ == "__main__":
    uvicorn.run(app, host="0.0.0.0", port=8000)