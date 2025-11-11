import asyncio
from dotenv import load_dotenv
import os

# --- Load .env file ---
load_dotenv()  # this makes OPENAI_API_KEY available to os.environ

from agent_squad.orchestrator import AgentSquad
from agent_squad.agents.openai_agent import OpenAIAgent, OpenAIAgentOptions
from agent_squad.classifiers.openai_classifier import OpenAIClassifier, OpenAIClassifierOptions

async def main():
    # Create the orchestrator with OpenAI classifier (instead of default Bedrock)
    classifier = OpenAIClassifier(
        options=OpenAIClassifierOptions(api_key=os.getenv("OPENAI_API_KEY"))
    )
    orchestrator = AgentSquad(classifier=classifier)

    # Initialize the OpenAI Agent (reads key from env)
    openai_agent = OpenAIAgent(
        options=OpenAIAgentOptions(
            name="Scheduler Assistant",
            description="A helpful assistant that schedules events on Google Calendar.",
            api_key=os.getenv("OPENAI_API_KEY"),
            model="gpt-4o-mini",
            streaming=True
        )
    )

    # Add to orchestrator
    orchestrator.add_agent(openai_agent)

    # Route a request
    response = await orchestrator.route_request(
        "Suggest me times to meet.",
        user_id="user123",
        session_id="sess1"
    )

    print("=== Response ===")
    # response.output is a ConversationMessage object
    # The content attribute contains the actual text
    if hasattr(response.output, 'content'):
        content = response.output.content
        if isinstance(content, list) and len(content) > 0:
            # Content is typically a list with text dictionaries or strings
            # Extract text from content items
            text_parts = []
            for item in content:
                if isinstance(item, dict) and 'text' in item:
                    text_parts.append(item['text'])
                elif isinstance(item, str):
                    text_parts.append(item)
                else:
                    text_parts.append(str(item))
            print(' '.join(text_parts) if text_parts else str(content))
        else:
            print(content if content else "No content")
    else:
        print(response.output)

if __name__ == "__main__":
    asyncio.run(main())
