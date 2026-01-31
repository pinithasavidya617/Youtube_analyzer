import os

from langchain_community.document_loaders import YoutubeLoader
from fastapi import FastAPI
from dotenv import load_dotenv
from langchain_core.prompts import ChatPromptTemplate
from langchain_google_genai import ChatGoogleGenerativeAI

from models import YoutubeAnalysisResponse, QuizResponse, YoutubeRequest

load_dotenv()
OPENROUTER_KEY = os.getenv("OPENROUTER_KEY")
OPENROUTER_URL = os.getenv("OPENROUTER_URL")

app = FastAPI(description="AI Youtube video transcript analysis tool")

from fastapi.middleware.cors import CORSMiddleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

llm = ChatGoogleGenerativeAI(model="gemini-2.5-flash")

analyze_prompt = ChatPromptTemplate.from_template(
    """
    You are a youtube transcript analyzer.
    Here is the transcript of the youtube video : {transcript}.

    Extract:
    - Main topics covered
    - Summary of the video
    - Recommended audience
    """
)

analyze_response = llm.with_structured_output(YoutubeAnalysisResponse)

quiz_prompt = ChatPromptTemplate.from_template(
    """
    You are an expert exam paper maker.
    Your Job is to generate a quiz based on the following transcript

    {transcript}

    - Generate exactly 10 questions
    - Each question should be a multiple choice(A, B, C, D)
    - Mark the correct answer

    """
)

quiz_llm = llm.with_structured_output(QuizResponse)


@app.post("/analyzer")
def yt_analyzer(request : YoutubeRequest):
    loader = YoutubeLoader.from_youtube_url(
        request.url, add_video_info=False
    )

    transcript = loader.load()
    response_chain = analyze_prompt | analyze_response
    response = response_chain.invoke({
        "transcript": transcript
    })
    return response

@app.post("/generate_quiz")
def get_quiz_resp(request : YoutubeRequest):
    loader = YoutubeLoader.from_youtube_url(request.url, add_video_info=False)
    transcript = loader.load()[0].page_content
    quiz_chain = quiz_prompt | quiz_llm
    response : QuizResponse = quiz_chain.invoke({"transcript" : transcript})
    return response
