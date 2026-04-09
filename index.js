// Jupyter hint coach extension using shared Step 1
(async function(codioIDE, window) {
  const ENVIRONMENT_GUIDANCE = {
    context_type: "notebook",
    purpose: "Environment-specific guidance for locating notebook exercise/task units and determining NOT_STARTED vs HAS_ATTEMPTED.",
    task_detection: {
      primary_boundaries: [
        "markdown headers such as Part, Exercise, Step, Question, [Graded], Task, Problem",
        "code cells with matching instructor-reference solution regions",
        "function definitions or notebook cells that align to a single graded prompt"
      ],
      solution_alignment_rule: "If the instructor reference contains ### BEGIN SOLUTION and ### END SOLUTION, treat the corresponding region in the matching student cell as the canonical student work zone, even when the student notebook lacks explicit # YOUR CODE HERE markers.",
      non_function_contexts: [
        {
          type: "script_based",
          guidance: "For top-level code exercises, use the markdown instruction cell plus the following code cell as one task when they clearly belong together."
        },
        {
          type: "cell_by_cell_analysis",
          guidance: "For notebooks where each step is one markdown cell followed by one code cell, treat each pair as a separate task."
        },
        {
          type: "sql_query_cells",
          guidance: "For SQL tasks, treat one query cell as one task. Use SQL comment markers like -- YOUR CODE HERE when present."
        },
        {
          type: "multi_cell_task",
          guidance: "If instructions explicitly say a task spans multiple cells, group those cells into one task."
        }
      ],
      multiple_functions_under_one_header: {
        rule: "When one section header introduces multiple functions in separate code cells, treat each function as a separate task.",
        title_pattern: "Use the section header plus the function name in the task title.",
        notes_guidance: "If they share a section header or shared test cell, mention that in notes."
      },
      ambiguity_rule: "When boundaries are ambiguous, prefer markdown headers first, then instructor-reference solution structure, then separate code cells as independent tasks."
    },
    work_zone_rules: {
      explicit_markers: [
        "# YOUR CODE HERE ... # END OF YOUR CODE",
        "# TODO",
        "# BEGIN STUDENT CODE",
        "## Your code here",
        "-- YOUR CODE HERE ... -- END OF YOUR CODE"
      ],
      fallback_rule: "If the student notebook lacks explicit markers, use the instructor reference solution span when available. Only if neither source gives markers, treat the cell body minus signatures, docstrings, imports, setup scaffolding, and return statements as the work zone.",
      starter_code_outside_zone: [
        "function signatures",
        "docstrings and explanatory comments",
        "setup logic",
        "return statements",
        "import statements"
      ]
    },
    status_rules: {
      has_attempted: [
        "any meaningful assignment",
        "operations or expressions that do real work",
        "function calls that perform work",
        "control flow such as loops or conditionals",
        "partial assignments like x =",
        "one meaningful non-comment executable line"
      ],
      not_started: [
        "raise NotImplementedError by itself",
        "pass by itself",
        "placeholder comments only",
        "empty work zone",
        "debugging statements only, such as print(\"test\") with no real task logic",
        "comment-only formulas or commented-out code"
      ],
      special_cases: [
        "Code outside the ideal work zone still counts as HAS_ATTEMPTED if it is clearly the student's attempt. Note that in notes.",
        "Commented-out placeholders plus real code still count as HAS_ATTEMPTED."
      ]
    },
    examples: [
      {
        label: "python_not_started",
        status: "NOT_STARTED",
        code: "def calculate_average(numbers):\n    \"\"\"Calculate the average of a list.\"\"\"\n    # YOUR CODE HERE\n    raise NotImplementedError()\n    # END OF YOUR CODE\n    return avg",
        why: "The student work zone contains only a placeholder."
      },
      {
        label: "python_attempted_with_bug",
        status: "HAS_ATTEMPTED",
        code: "def calculate_average(numbers):\n    \"\"\"Calculate the average of a list.\"\"\"\n    # YOUR CODE HERE\n    total = sum(numbers)\n    avg = total\n    #raise NotImplementedError()\n    # END OF YOUR CODE\n    return avg",
        why: "The student work zone contains implementation code even though it is wrong."
      },
      {
        label: "r_not_started",
        status: "NOT_STARTED",
        code: "calculate_mean <- function(vec) {\n  # YOUR CODE HERE\n  stop(\"Not implemented\")\n  # END OF YOUR CODE\n}",
        why: "The student work zone contains only a placeholder."
      },
      {
        label: "r_attempted_with_bug",
        status: "HAS_ATTEMPTED",
        code: "calculate_mean <- function(vec) {\n  # YOUR CODE HERE\n  total <- sum(vec)\n  avg <- total\n  # END OF YOUR CODE\n  return(avg)\n}",
        why: "The student work zone contains implementation code."
      },
      {
        label: "sql_not_started",
        status: "NOT_STARTED",
        code: "-- YOUR CODE HERE\n-- Write a query to find average salary by department\n-- END OF YOUR CODE",
        why: "The task region contains only comments and placeholders."
      },
      {
        label: "sql_attempted_with_bug",
        status: "HAS_ATTEMPTED",
        code: "-- YOUR CODE HERE\nSELECT department, salary\nFROM employees\n-- END OF YOUR CODE",
        why: "The query is real implementation even though it is incomplete or incorrect."
      },
      {
        label: "script_based_notebook_task",
        status: "HAS_ATTEMPTED",
        code: "# YOUR CODE HERE\ndata = pd.read_csv(\"data.csv\")\nmean_value = data[\"column\"].mean()\n# END OF YOUR CODE",
        why: "Top-level code in a non-function context still counts as implementation."
      },
      {
        label: "single_line_attempt",
        status: "HAS_ATTEMPTED",
        code: "G = X @ Z.T",
        why: "A single meaningful implementation line is enough."
      },
      {
        label: "comment_only_not_started",
        status: "NOT_STARTED",
        code: "# D = sqrt(S + R - 2G)\n# maybe compute shape here",
        why: "Comment-only edits do not count as implementation."
      }
    ],
    shared_header_example: {
      header: "Part Two: Implement calculate_S and calculate_R",
      cell_a: "def calculate_S(X, n, m): ...",
      cell_b: "def calculate_R(Z, n, m): ...",
      guidance: "Treat calculate_S and calculate_R as separate tasks. If one is attempted and the other is not, record separate statuses and note any shared test cell."
    },
    output_mapping_hints: {
      type: "cell",
      location_guidance: "Use student and solution cell indices for notebook tasks.",
      evidence_signals: [
        "contains_assignment",
        "has_control_flow",
        "placeholder_present",
        "comment_only",
        "code_outside_expected_region"
      ]
    }
  };

  codioIDE.coachBot.register(
    "customHintsJupyterML",
    "ML hint button",
    onButtonPress
  );

  async function onButtonPress() {
    codioIDE.coachBot.showThinkingAnimation();

    try {
      console.info("[Jupyter Hint] getContext:start");
      const context = await codioIDE.coachBot.getContext();
      console.info("[Jupyter Hint] getContext:success", summarizeContext(context));
      const environmentGuidance = loadEnvironmentGuidance();
      const notebookContext = getNotebookContext(context);
      const studentNotebook = serializeNotebookContext(notebookContext);
      const guideInstructions = getGuideInstructions(context);
      const workedExample = getWorkedExample(context);
      console.info("[Jupyter Hint] payload:prepared", {
        notebookPath: notebookContext ? notebookContext.path || null : null,
        studentContextChars: studentNotebook.length,
        guideInstructionChars: guideInstructions.length,
        workedExampleChars: workedExample.length
      });

      console.info("[Jupyter Hint] step1:start");
      const step1Result = await codioIDE.coachBot.ask({
        systemPrompt: "You locate notebook tasks and determine NOT_STARTED vs HAS_ATTEMPTED. Return only valid JSON.",
        userPrompt: "{% prompt 'AGENT_STEP_1_LOCATE_TASKS' %}",
        vars: {
          CONTEXT_TYPE: "notebook",
          STUDENT_CONTEXT: studentNotebook,
          INSTRUCTOR_REFERENCE: "",
          EDITABLE_TARGETS: JSON.stringify({
            type: "cells",
            source_path: notebookContext ? notebookContext.path || null : null
          }),
          TASK_BOUNDARY_HINTS: JSON.stringify({
            student_markers: [
              "# YOUR CODE HERE",
              "# END OF YOUR CODE",
              "# TODO",
              "# BEGIN STUDENT CODE",
              "## Your code here",
              "-- YOUR CODE HERE",
              "-- END OF YOUR CODE"
            ],
            solution_markers: [
              "### BEGIN SOLUTION",
              "### END SOLUTION"
            ],
            header_patterns: [
              "Part",
              "Exercise",
              "Step",
              "Question",
              "[Graded]",
              "Task",
              "Problem"
            ]
          }),
          ASSESSMENT_CONTEXT: JSON.stringify({
            opened_resource: notebookContext ? notebookContext.path || "notebook" : "notebook"
          })
        }
      }, { stream: false, preventMenu: true });
      const step1Json = normalizeCoachJson(step1Result, "step1");
      console.info("[Jupyter Hint] step1:success", summarizeCoachResult(step1Json));

      console.info("[Jupyter Hint] step2:start");
      const step2Result = await codioIDE.coachBot.ask({
        systemPrompt: "You analyze notebook student work, select a task, and diagnose it. Return only valid JSON.",
        userPrompt: "{% prompt 'AGENT_STEP_2_ANALYZE_JUPYTER_V2' %}",
        vars: {
          CONTEXT_TYPE: "notebook",
          STUDENT_CONTEXT: studentNotebook,
          INSTRUCTOR_REFERENCE: "",
          GUIDE_INSTRUCTIONS: guideInstructions,
          WORKED_EXAMPLE: workedExample,
          EDITABLE_TARGETS: JSON.stringify({
            type: "cells",
            source_path: notebookContext ? notebookContext.path || null : null
          }),
          TASK_BOUNDARY_HINTS: JSON.stringify({
            solution_markers: [
              "### BEGIN SOLUTION",
              "### END SOLUTION"
            ]
          }),
          ASSESSMENT_CONTEXT: JSON.stringify({
            opened_resource: notebookContext ? notebookContext.path || "notebook" : "notebook"
          }),
          ENVIRONMENT_GUIDANCE: JSON.stringify(environmentGuidance),
          STEP_1: step1Json
        }
      }, { stream: false, preventMenu: true });
      const step2Json = normalizeCoachJson(step2Result, "step2");
      console.info("[Jupyter Hint] step2:success", summarizeCoachResult(step2Json));

      codioIDE.coachBot.hideThinkingAnimation();

      console.info("[Jupyter Hint] step3:start");
      await codioIDE.coachBot.ask({
        systemPrompt: "You construct one helpful, well-calibrated notebook hint. Return only plain text.",
        userPrompt: "{% prompt 'AGENT_STEP_3_HINT_JUPYTER_V2' %}",
        vars: {
          STUDENT_CONTEXT: studentNotebook,
          GUIDE_INSTRUCTIONS: guideInstructions,
          WORKED_EXAMPLE: workedExample,
          STEP_1: step1Json,
          STEP_2: step2Json
        }
      });
      console.info("[Jupyter Hint] step3:success");
    } catch (error) {
      handlePipelineError(error);
    }
  }

  function loadEnvironmentGuidance() {
    console.info("[Jupyter Hint] guidance:inlined");
    return ENVIRONMENT_GUIDANCE;
  }

  function getNotebookContext(context) {
    if (context && Array.isArray(context.jupyterContext) && context.jupyterContext.length > 0) {
      return context.jupyterContext[0];
    }
    return null;
  }

  function serializeNotebookContext(notebookContext) {
    if (!notebookContext || !Array.isArray(notebookContext.content)) {
      return "[]";
    }

    const markdownAndCodeCells = notebookContext.content
      .map(function(cell, index) {
        const normalizedType = cell.type || cell.cell_type || null;
        const normalizedSource = Array.isArray(cell.source)
          ? cell.source.join("")
          : typeof cell.source === "string"
            ? cell.source
            : "";
        const minimalCell = {
          cell: index,
          type: normalizedType,
          source: normalizedSource
        };

        if (cell.metadata && cell.metadata.nbgrader) {
          minimalCell.metadata = {
            nbgrader: cell.metadata.nbgrader
          };
        }

        return minimalCell;
      })
      .filter(function(cell) {
        return cell.type === "markdown" || cell.type === "code";
      });

    return JSON.stringify(markdownAndCodeCells);
  }

  function getGuideInstructions(context) {
    if (context && context.guidesPage && typeof context.guidesPage.content === "string") {
      return context.guidesPage.content;
    }
    return "";
  }

  function getWorkedExample(context) {
    if (context && context.guidesPage && typeof context.guidesPage.content === "string") {
      const title = String(context.guidesPage.title || "").toLowerCase();
      if (title.includes("example") || title.includes("walkthrough")) {
        return context.guidesPage.content;
      }
    }
    return "";
  }

  function summarizeContext(context) {
    return {
      hasJupyterContext: !!(context && Array.isArray(context.jupyterContext) && context.jupyterContext.length > 0),
      jupyterContextCount: context && Array.isArray(context.jupyterContext) ? context.jupyterContext.length : 0,
      hasGuidesPage: !!(context && context.guidesPage),
      guideTitle: context && context.guidesPage ? context.guidesPage.title || null : null
    };
  }

  function summarizeCoachResult(result) {
    const raw = typeof result === "string"
      ? result
      : result && typeof result.result === "string"
        ? result.result
        : "";
    return {
      hasResult: !!raw,
      resultChars: raw.length,
      preview: raw.slice(0, 200)
    };
  }

  function normalizeCoachJson(result, label) {
    const raw = result && typeof result.result === "string" ? result.result : "";
    const extracted = extractJsonObject(raw);

    if (!extracted) {
      throw new Error("Unable to extract JSON from " + label + " result.");
    }

    try {
      const parsed = JSON.parse(extracted);
      const normalized = JSON.stringify(parsed);
      console.info("[Jupyter Hint] " + label + ":normalized", {
        rawChars: raw.length,
        jsonChars: normalized.length
      });
      return normalized;
    } catch (error) {
      console.error("[Jupyter Hint] " + label + ":json-parse-failed", {
        message: error && error.message ? error.message : null,
        preview: raw.slice(0, 400)
      });
      throw error;
    }
  }

  function extractJsonObject(raw) {
    if (!raw || typeof raw !== "string") {
      return null;
    }

    const fencedMatch = raw.match(/```json\s*([\s\S]*?)\s*```/i);
    if (fencedMatch && fencedMatch[1]) {
      return fencedMatch[1].trim();
    }

    const firstBrace = raw.indexOf("{");
    const lastBrace = raw.lastIndexOf("}");
    if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
      return raw.slice(firstBrace, lastBrace + 1).trim();
    }

    return null;
  }

  function handlePipelineError(error) {
    console.error("[Jupyter Hint] pipeline:error", {
      message: error && error.message ? error.message : null,
      name: error && error.name ? error.name : null,
      stack: error && error.stack ? error.stack : null,
      raw: error
    });
    codioIDE.coachBot.hideThinkingAnimation();
    codioIDE.coachBot.write("I'm having trouble analyzing your notebook right now. Please try clicking the hint button again.");
    codioIDE.coachBot.showMenu();
  }
})(window.codioIDE, window);