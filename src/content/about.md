---
experience:
  - role: "Backend Developer & DevOps"
    company: "Intake · Lanzadera"
    period: "April 2026 – present"
    tags:
      - Python
      - FastAPI
      - MongoDB
      - PostgreSQL
      - Redis
      - AWS ECS
      - ECR
      - S3
      - CloudFront
      - Docker
      - GitHub Actions
    paragraphs:
      - "Intake is a B2B SaaS helpdesk platform with a conversational AI agent, knowledge base management, and ticketing. The company is part of Lanzadera, Barcelona's startup accelerator. I joined as the backend developer and, at some point, also became responsible for the infrastructure."
      - "I designed and own the full AWS architecture: ECS Fargate for services, ECR for container images, ElastiCache Redis, S3 + CloudFront for frontends, Secrets Manager, and GPU instances for running Hugging Face models. The kind of setup where the decisions you make have a direct line to the bill."
      - "The CI/CD pipeline runs on GitHub Actions: main branch deploys to pre-production, version tags go to production with manual approval. Ten ECS services across four repositories. Once it was working, deployments stopped being something to think about."
      - "On the backend: FastAPI, HTTP logging middleware with UUID traceability, structured logging with structlog, a custom domain error system, rate limiting and validation handlers. Also built the integrations with Slack, Microsoft Teams, and WhatsApp Business for the conversational agent, and designed the RAG pipeline — embeddings, retrieval, prompt construction with Ollama on AWS — which is evolving toward function calling via Anthropic API and routing through Amazon Bedrock."
  - role: "Full Stack Developer Intern"
    company: "Moodest"
    period: "September 2025 – April 2026"
    tags:
      - TypeScript
      - Angular
      - Python
      - FastAPI
      - MongoDB
      - Redis
      - Docker
      - Nginx
    paragraphs:
      - "Moodest builds a B2B SaaS HR AI platform. I joined to build the full product dashboard — Angular + TypeScript, from scratch — and ended up also owning a FastAPI API that integrates with a time-tracking platform used by 300,000+ users: authentication, roles, KPI endpoints, security review, and production deployment."
      - "DevOps came with the territory: Docker Compose, Nginx on the production server. Nobody officially assigned it; it just made more sense to fix the pipeline than to watch it fail. Agile environment, Scrum and Kanban, pull requests, code reviews — the full process."
education:
  - degree: "Grado Medio SMR"
    institution: "Escola Pia Santa Anna, Mataró"
    period: "2024 – 2026"
    description: "Sistemas Microinformáticos y Redes. Networking, systems administration, hardware. Useful for understanding what actually happens below the application layer."
  - degree: "Máster en Programación y Desarrollo Web"
    institution: ""
    period: "2024 – 2026"
    description: "Frontend (HTML, CSS, JS, React, Next.js) and backend (Python: Django, Flask, FastAPI). Running in parallel with everything else."
  - degree: "ESO"
    institution: "Institut Esteve Albert, Sant Vicenç De Montalt"
    period: "2020 – 2024"
    description: ""
training:
  - title: "Hack4u"
    subtitle: "Cybersecurity Academy · 2024"
    description: "Offensive Python, intro to hacking, Linux administration. Where I learned to stop thinking like a developer and start thinking like someone trying to break what developers built. The perspective shift is irreversible, which is mostly a good thing."
  - title: "Rust"
    subtitle: "Self-directed · 2025"
    description: "Ownership, borrowing, concurrency with Tokio, systems projects. Rust will make you understand memory management whether you intended to learn it or not. I consider this a feature."
---

I'm Oscar Fernandez — Tay online. 18 years old, from Mataró, a medium-sized city near Barcelona that's best known for being not quite Barcelona.

I got into programming the way most people probably shouldn't: cheating in FiveM servers. I wanted free items, so I learned Lua. Then I wanted to understand why the exploits worked, so I learned more. Then I wanted to build the things I was breaking, and somewhere in that process it stopped being about the cheats entirely.

That led me to hacking courses, pentesting, and eventually to the realization that what I actually enjoy most is the other side — designing systems, thinking through architecture, writing code that does what it's supposed to do and doesn't embarrass you six months later. Security gave me a way of thinking about software that most developers don't have at the start. I still use it.

I'm currently working as a Backend Developer at Intake, a B2B SaaS startup inside Lanzadera, Barcelona's main startup accelerator, while enrolled in two academic programs simultaneously. I didn't plan it this way. It just kind of happened, and now it's my life.

Day to day I work with Python, FastAPI, MongoDB, Redis, and whatever else the problem requires. What I enjoy most is the thinking part — breaking down a problem, designing a solution that actually makes sense, and implementing it cleanly. What I enjoy least is inheriting code that was written without any of that. It exists everywhere and it's always someone else's fault.

I'm learning Rust because I want to understand systems at a level where nothing is magic. I'm interested in Go for the same reason. At some point I'd like to contribute to something that other people actually use. That's roughly the plan, to the extent there is one.
