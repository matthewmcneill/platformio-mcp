---
name: architectural-refactoring
description: Critically review C++ or module codebases, make architectural recommendations, and refactor the code to improve readability, abstraction, and encapsulation using OOP paradigms. Use this skill whenever you are asked to refactor, improve the architecture of a module, reduce global state, or evaluate a component against object-oriented best practices.
---

# Architectural Refactoring Skill

This skill provides a structured workflow to review, evaluate, and iteratively refactor modules or entire codebases to adhere to robust architectural standards. 

## 1. Core Architectural Principles
When evaluating or refactoring code, enforce the following paradigms:

- **Single Responsibility Principle (SRP)**: Every class, module, or function should have one, and only one, reason to change. 
- **Open/Closed Principle (OCP)**: Software entities should be open for extension but closed for modification. Use interfaces and polymorphism to allow new features without changing existing code.
- **Dependency Inversion Principle (DIP)**: High-level modules should not depend on low-level modules. Both should depend on abstractions (e.g., interfaces). Abstractions should not depend on details. Details should depend on abstractions.
- **Law of Demeter (Principle of Least Knowledge)**: A component should only talk to its immediate friends and avoid reaching through multiple objects.

## 2. Encapsulation Standards
- **Data Hiding**: All member variables should be `private` or `protected`. State changes should only occur through clearly defined public methods.
- **Minimize Global State**: Avoid global variables (`extern` or globally scoped instances) whenever possible. Global state makes testing difficult and obscures dependencies. Use Dependency Injection (DI) or Singleton patterns selectively instead of floating global objects.
- **Clear Interfaces**: Public methods should define *what* the object does, not *how* it does it.
- **Immutable State**: If an object does not need to change state after creation, initialize it via the constructor and do not expose setters.

## 3. Abstraction Standards
- **Use Interfaces (`i`-prefixed abstract classes)**: Define contracts for behaviors. This decouples the consumer from the concrete implementation.
- **Decouple Hardware from Logic**: Separate hardware-specific calls from business logic.
- **Dependency Injection**: Pass dependencies into constructors or `begin()` methods rather than having components instantiate their own dependencies.

## 4. Execution Workflow

When tasked to review and update a codebase or module using this skill, strictly follow this workflow:

### Step 1: Analyze and Evaluate
Review the target codebase or module against the criteria above. Look for:
- Overcrowded files or classes violating SRP.
- Disorganized global state or excessive `extern` variables.
- Tight coupling between layers.
- Missing interfaces for swappable components.
- Direct instantiation of complex dependencies instead of DI.

### Step 2: Formulate Recommendations
Draft a concise markdown report for the user detailing the architectural flaws. Group the findings by:
- **Modular Structure & Responsibilities**: What should be extracted?
- **Encapsulation & Global State**: Which globals can be grouped or injected?
- **Abstraction & Interfaces**: What interfaces need to be created?

### Step 3: Propose Refactoring Roadmap
Provide a step-by-step roadmap to implement the recommendations. **Do not immediately refactor everything at once.** Present the evaluation and roadmap to the user and ask for their approval to proceed or ask which step they would like to tackle first.

### Step 4: Update the Software (Execution)
Once the user approves a step, execute the refactoring carefully:
1. Write new headers and interfaces first.
2. Implement the decoupled classes.
3. Shift global state into localized configurations or manager classes.
4. Update the bootstrapping code to use Dependency Injection.
5. Ensure the code remains compilable after each logical step. If you remove global variables, ensure they are properly passed into the dependent objects.

## Example Output Format
When presenting the initial evaluation (Step 2 & 3), format it clearly:

### Codebase Architectural Evaluation

**1. Modular Structure**
- *Issue*: `moduleX.cpp` handles both networking and display logic.
- *Recommendation*: Extract networking logic into a new `NetworkManager` class.

**2. Encapsulation**
- *Issue*: `int globalStateMode` is exposed globally.
- *Recommendation*: Move `globalStateMode` into `ConfigManager` and inject it where needed.

**Proposed Roadmap:**
1. Extract `NetworkManager`.
2. Encapsulate global state variables.
...
