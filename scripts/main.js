// Configuration
const minZoom = 0.25; // Slider minimum zoom value.
const maxZoom = 2.0; // Slider maximum zoom value.

// Global variables
let cy; // Cytoscape instance.
let selectedTeam = null; // Currently selected team.

// Team DOM references
const teamSelector = document.getElementById("team-selector");

// Modal DOM references
const taskModal = document.getElementById("task-modal");
const modalName = document.getElementById("modal-name");
const modalIcon = document.getElementById("modal-icon");
const modalDescription = document.getElementById("modal-description");
const modalRewards = document.getElementById("modal-rewards");
const modalRewardsList = document.getElementById("modal-rewards-list");
const modalPredicate = document.getElementById("modal-predicate");
const modalPredicateList = document.getElementById("modal-predicate-list");
const modalClose = document.getElementById("modal-close");
const modalHeader = document.getElementById("modal-header");

// Zoom DOM references
const zoomSlider = document.getElementById("zoom-slider");
const zoomInBtn = document.getElementById("zoom-in-btn");
const zoomOutBtn = document.getElementById("zoom-out-btn");
const resetLayoutBtn = document.getElementById("reset-layout-btn");

function debounce(func, wait) {
  let timeout;
  return function (...args) {
    const context = this;
    clearTimeout(timeout);
    timeout = setTimeout(() => func.apply(context, args), wait);
  };
}

function transformHex(hex, amount) {
  const shorthandRegex = /^#?([a-f\d])([a-f\d])([a-f\d])$/i;
  hex = hex.replace(shorthandRegex, function (m, r, g, b) {
    return r + r + g + g + b + b;
  });

  let color = "#";
  for (let i = 0; i < 3; i++) {
    let part = hex.substring(i * 2 + 1, i * 2 + 3);
    let value = parseInt(part, 16);

    value = Math.floor(value * (1 + amount / 100));
    value = Math.min(Math.max(0, value), 255);
    color += ("00" + value.toString(16)).slice(-2);
  }

  return color;
}

function _saveNodePositions() {
  const positions = {};
  cy.nodes().forEach((node) => {
    if (node.grabbed()) {
      positions[node.id()] = node.position();
    } else {
      positions[node.id()] = node.position();
    }
  });
  localStorage.setItem("tm_nodePositions", JSON.stringify(positions));
}

function _saveViewport() {
  const viewport = {
    zoom: cy.zoom(),
    pan: cy.pan(),
  };
  localStorage.setItem("tm_viewport", JSON.stringify(viewport));
}

const centerOnStartNode = () => {
  if (!cy) return;

  const startNode = cy.getElementById("t1_intro");
  if (startNode.length > 0) {
    cy.animate(
      {
        fit: {
          eles: startNode,
          padding: 150,
        },
      },
      {
        duration: 300,
        complete: () => {
          _saveViewport();
        },
      }
    );
  }
};

const centerOnStartNodeDebounced = debounce(centerOnStartNode, 250);

const saveNodePositionsDebounced = debounce(_saveNodePositions, 100);
const saveViewportDebounced = debounce(_saveViewport, 100);

function loadNodePositions() {
  const cachedPositions = localStorage.getItem("tm_nodePositions");
  if (cachedPositions) {
    try {
      return JSON.parse(cachedPositions);
    } catch (e) {
      console.error("Failed to parse cached positions", e);
      return null;
    }
  }
  return null;
}

function parseTaskData(tasks) {
  const elements = [];
  const nodePositions = loadNodePositions();

  tasks.forEach((task) => {
    const nodeData = {
      group: "nodes",
      data: {
        id: task.id,
        name: task.name,
        description: task.description,
        icon: "icons/" + task?.icon,
        rewards: task.rewards || [],
      },
    };

    if (nodePositions && nodePositions[task.id]) {
      nodeData.position = nodePositions[task.id];
    }

    elements.push(nodeData);

    if (task.predicates && task.predicates.length > 0) {
      task.predicates.forEach((predicateId) => {
        elements.push({
          group: "edges",
          data: {
            id: `${predicateId}>${task.id}`,
            source: predicateId,
            target: task.id,
          },
        });
      });
    }
  });

  return elements;
}

function updateGraphStyles() {
  if (!cy) return;
  const teamColor = selectedTeam ? selectedTeam.color : "#6b7280";

  cy.batch(() => {
    cy.nodes().forEach((node) => {
      const isCompleted = selectedTeam
        ? selectedTeam.completedTasks.includes(node.data().id)
        : false;

      if (isCompleted) {
        node.addClass("completed");
      } else {
        node.removeClass("completed");
      }
    });

    cy.edges().forEach((edge) => {
      const sourceNode = edge.source();
      if (sourceNode.hasClass("completed")) {
        edge.addClass("completed");
      } else {
        edge.removeClass("completed");
      }
    });

    cy.style()
      .selector(".completed")
      .style({
        "background-color": transformHex(teamColor, -30),
        "border-color": teamColor,
        "line-color": teamColor,
        "target-arrow-color": teamColor,
      })
      .update();
  });
}

function populateTeamSelector(TEAMS) {
  const teamButtons = new Map();

  const allButton = document.createElement("button");
  allButton.innerHTML = "Unaffiliated";
  allButton.className =
    "team-button p-4 text-gray-300 hover:bg-gray-700 transition-colors";
  allButton.style.borderColor = "#6b7280";
  allButton.onclick = () => selectTeam(null, allButton);
  teamSelector.appendChild(allButton);

  TEAMS.forEach((team) => {
    const button = document.createElement("button");
    button.innerHTML = team.name;
    button.className =
      "team-button p-4 text-gray-300 hover:bg-gray-700 transition-colors";
    button.style.borderColor = team.color;
    button.onclick = () => selectTeam(team, button);
    teamSelector.appendChild(button);
    teamButtons.set(team.id, button);
  });

  const cachedTeamId = localStorage.getItem("tm_selectedTeamId");
  if (cachedTeamId && teamButtons.has(cachedTeamId)) {
    const team = TEAMS.find((t) => t.id === cachedTeamId);
    const button = teamButtons.get(cachedTeamId);
    selectTeam(team, button);
  } else {
    selectTeam(null, allButton);
  }
}

function selectTeam(team, clickedButton) {
  selectedTeam = team;

  document.querySelectorAll(".team-button").forEach((btn) => {
    btn.classList.remove("active", "text-white");
    btn.style.borderBottomWidth = "0px";
  });
  clickedButton.classList.add("active", "text-white");

  updateGraphStyles();

  if (team) {
    localStorage.setItem("tm_selectedTeamId", team.id);
  } else {
    localStorage.removeItem("tm_selectedTeamId");
  }
}

function openTaskModal(node, position) {
  const taskData = node.data();

  modalName.textContent = taskData.name;
  modalDescription.textContent = taskData.description;

  if (node.hasClass("completed")) {
    modalName.style.color = transformHex(selectedTeam.color, 20);
  } else {
    modalName.style.color = "#ffffff";
  }

  modalIcon.src =
    taskData.icon ??
    `https::placehold.co/64x64/eee/999?text=${taskData.name.substring(0, 2)}`;
  modalIcon.onerror = () => {
    modalIcon.src = "https://placehold.co/64x64/eee/999?text=ICON";
  };

  if (node.hasClass("completed") && selectedTeam) {
    taskModal.style.borderColor = selectedTeam.color;
  } else {
    taskModal.style.borderColor = "transparent";
  }

  modalRewardsList.innerHTML = "";
  if (taskData.rewards && taskData.rewards.length > 0) {
    modalRewards.style.display = "block";

    taskData.rewards.forEach((reward) => {
      const li = document.createElement("li");
      li.className = "flex items-center";

      const iconPlaceholder = `https://placehold.co/32x32/6b7280/ffffff?text=${reward.name.substring(
        0,
        1
      )}`;
      const iconSrc = reward.icon ? "icons/" + reward.icon : iconPlaceholder;

      li.innerHTML = `
        <img
          src="${iconSrc}"
          onerror="this.src='${iconPlaceholder}'"
          alt="Reward Icon"
          class="w-8 h-8 rounded-md mr-3 ${
            node.hasClass("completed") ? "bg-green-400" : "bg-gray-600"
          } flex-shrink-0"
        />
        <div>
          <span class="text-lg font-semibold text-gray-100">${
            reward.name
          }</span>
          ${
            reward.description
              ? `<p class="text-sm text-gray-400">${reward.description}</p>`
              : ""
          }
        </div>
      `;
      modalRewardsList.appendChild(li);
    });
  } else {
    modalRewards.style.display = "none";
  }

  modalPredicateList.innerHTML = "";
  const incomingEdges = node.incomers("edge");

  if (incomingEdges.length > 0) {
    modalPredicate.style.display = "block";

    incomingEdges.forEach((edge) => {
      const predicateNode = edge.source();
      const predicateData = predicateNode.data();

      const isPredicateComplete = predicateNode.hasClass("completed");

      const statusColorClass = isPredicateComplete
        ? "text-green-400 hover:text-green-300"
        : "text-red-400 hover:text-red-300";

      const li = document.createElement("li");
      li.className = "flex items-center bg-gray-700 p-3 rounded-lg";

      const iconPlaceholder = `https://placehold.co/32x32/eee/999?text=${predicateData.name.substring(
        0,
        2
      )}`;

      li.innerHTML = `
        <img
          src="${iconPlaceholder}"
          onerror="this.src='https://placehold.co/32x32/eee/999?text=ICON'"
          alt="Predicate Icon"
          class="w-8 h-8 rounded-md mr-3 bg-gray-200 flex-shrink-0"
        />
        <span
          class="text-lg font-semibold ${statusColorClass} cursor-pointer"
          data-predicate-id="${predicateData.id}"
        >
          ${predicateData.name}
        </span>
      `;

      li.querySelector("span").onclick = () => {
        closeTaskModal();
        cy.animate(
          { fit: { eles: predicateNode, padding: 150 } },
          {
            duration: 500,
            complete: () => {
              // Recalculate position for the new modal
              const nodePos = predicateNode.renderedPosition();
              const nodeWidth = predicateNode.renderedWidth();
              const nodeHeight = predicateNode.renderedHeight();
              const modalPosition = {
                x: nodePos.x + nodeWidth / 2 + 10,
                y: nodePos.y - nodeHeight / 2,
              };
              openTaskModal(predicateNode, modalPosition);
            },
          }
        );
      };

      modalPredicateList.appendChild(li);
    });
  } else {
    modalPredicate.style.display = "none";
  }

  if (position && window.innerWidth > 640) {
    taskModal.style.left = position.x + "px";
    taskModal.style.top = position.y + "px";
    taskModal.style.transform = "";
  } else {
    // Let CSS center it
    taskModal.style.left = "";
    taskModal.style.top = "";
    taskModal.style.transform = "";
  }
  // /END OF CHANGE 1

  taskModal.classList.remove("scale-95", "opacity-0", "invisible");
  taskModal.classList.add("scale-100", "opacity-100", "visible");
}

function closeTaskModal() {
  taskModal.classList.add("scale-95", "opacity-0", "invisible");
  taskModal.classList.remove("scale-100", "opacity-100", "visible");
  taskModal.style.transform = "";
}

function getCoseLayout() {
  return {
    name: "cose",
    idealEdgeLength: 100,
    nodeOverlap: 20,
    refresh: 20,
    fit: true,
    padding: 30,
    randomize: false,
    componentSpacing: 100,
    nodeRepulsion: 2400000,
    edgeElasticity: 100,
    nestingFactor: 5,
    gravity: 80,
    numIter: 1000,
    initialTemp: 200,
    coolingFactor: 0.95,
    minTemp: 1.0,
  };
}

function initializeCytoscape(TASKS_DATA) {
  const nodePositions = loadNodePositions();

  cy = cytoscape({
    container: document.getElementById("cy"),
    elements: parseTaskData(TASKS_DATA),

    layout: nodePositions ? { name: "preset" } : getCoseLayout(),

    wheelSensitivity: 0.8,
    minZoom: minZoom,
    maxZoom: maxZoom,

    style: [
      {
        selector: "node",
        style: {
          shape: "square",
          width: 80,
          height: 80,
          "background-color": "#4b5563",
          "border-color": "#6b7280",
          "border-width": 4,
          "background-image": (ele) =>
            ele.data("icon")
              ? ele.data("icon")
              : `https://placehold.co/100x100/4b5563/ffffff?text=${ele
                  .data("name")
                  .substring(0, 2)}`,
          "background-fit": "cover",
          "background-clip": "none",
          label: "data(name)",
          color: "#ffffff",
          "text-valign": "bottom",
          "text-halign": "center",
          "text-margin-y": 8,
          "font-weight": "600",
          "font-size": 14,
          "text-outline-color": "#1a1a1a",
          "text-outline-width": 3,
          "transition-property":
            "background-color, border-color, text-decoration",
          "transition-duration": "0.3s",
          "text-decoration": "none",
        },
      },
      {
        selector: "edge",
        style: {
          width: 5,
          "line-color": "#6b7280",
          "target-arrow-shape": "triangle",
          "target-arrow-color": "#6b7280",
          "curve-style": "bezier",
          "transition-property": "line-color, target-arrow-color, width",
          "transition-duration": "0.3s",
        },
      },

      {
        selector: "node.completed",
        style: {
          shape: "square",
          "background-color": "#10b981",
          "border-color": "#10b981",
          "border-width": 5,
          "background-image": (ele) =>
            ele.data("icon")
              ? ele.data("icon")
              : `https://placehold.co/100x100/4b5563/ffffff?text=${ele
                  .data("name")
                  .substring(0, 2)}`,
        },
      },

      {
        selector: "edge.completed",
        style: {
          width: 8,
          "line-color": "#10b981",
          "target-arrow-color": "#10b981",
          "line-style": "dotted",
          "line-dash-pattern": [15, 10],
          "line-dash-offset": 0,
        },
      },

      {
        selector: "node.highlighted",
        style: {
          "shadow-color": "#3b82f6",
          "shadow-blur": 25,
          "shadow-opacity": 1,
        },
      },
    ],
  });

  cy.on("tap", "node", (evt) => {
    const node = evt.target;

    const nodePos = node.renderedPosition();
    const nodeWidth = node.renderedWidth();
    const nodeHeight = node.renderedHeight();

    const modalPosition = {
      x: nodePos.x + nodeWidth / 2 + 10,
      y: nodePos.y - nodeHeight / 2,
    };

    openTaskModal(node, modalPosition);
  });

  cy.on("tap", (evt) => {
    if (evt.target === cy) {
      closeTaskModal();
    }
  });

  modalClose.onclick = closeTaskModal;

  cy.on("free", "node", saveNodePositionsDebounced);
  cy.on("zoom pan", saveViewportDebounced);

  const cachedViewport = localStorage.getItem("tm_viewport");
  if (cachedViewport) {
    try {
      const { zoom, pan } = JSON.parse(cachedViewport);
      cy.viewport({ zoom, pan });
      zoomSlider.value = Math.round(zoom * 100);
    } catch (e) {
      console.error("Failed to parse cached viewport", e);
    }
  }

  zoomSlider.addEventListener("input", (e) => {
    let zoomLevel;
    if (window.innerWidth <= 640) {
      zoomLevel = (225 - e.target.value) / 100;
    } else {
      zoomLevel = e.target.value / 100;
    }
    cy.viewport({ zoom: zoomLevel, pan: cy.pan() });
  });

  zoomSlider.addEventListener("change", (e) => {
    _saveViewport();
  });

  cy.on("zoom", () => {
    const zoomLevel = cy.zoom();
    let sliderValue;
    if (window.innerWidth <= 640) {
      sliderValue = 225 - zoomLevel * 100;
    } else {
      sliderValue = zoomLevel * 100;
    }
    zoomSlider.value = Math.round(sliderValue);
  });

  zoomInBtn.addEventListener("click", () => {
    const newZoom = Math.min(maxZoom, cy.zoom() * 1.25);
    cy.viewport({ zoom: newZoom, pan: cy.pan() });
  });

  zoomOutBtn.addEventListener("click", () => {
    const newZoom = Math.max(minZoom, cy.zoom() * 0.8);
    cy.viewport({ zoom: newZoom, pan: cy.pan() });
  });

  resetLayoutBtn.onclick = () => {
    localStorage.removeItem("tm_nodePositions");
    localStorage.removeItem("tm_viewport");
    const coseLayout = cy.layout(getCoseLayout());
    coseLayout.one("layoutstop", () => {
      _saveNodePositions();
      _saveViewport();
      const zoomLevel = cy.zoom();
      let sliderValue;
      if (window.innerWidth <= 640) {
        sliderValue = 225 - zoomLevel * 100;
      } else {
        sliderValue = zoomLevel * 100;
      }
      zoomSlider.value = Math.round(sliderValue);
    });
    coseLayout.run();
  };

  let isDragging = false;
  let offsetX = 0;
  let offsetY = 0;

  modalHeader.addEventListener("mousedown", (e) => {
    if (window.innerWidth <= 640) {
      return;
    }

    isDragging = true;
    const rect = taskModal.getBoundingClientRect();
    offsetX = e.clientX - rect.left;
    offsetY = e.clientY - rect.top;
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
  });

  function onMouseMove(e) {
    if (!isDragging) return;
    taskModal.style.left = e.clientX - offsetX + "px";
    taskModal.style.top = e.clientY - offsetY + "px";
  }

  function onMouseUp() {
    isDragging = false;
    document.removeEventListener("mousemove", onMouseMove);
    document.removeEventListener("mouseup", onMouseUp);
  }
}

function animateEdges() {
  cy.style()
    .selector("edge.completed")
    .style("line-dash-offset", () => -Date.now() / 50)
    .update();
  requestAnimationFrame(animateEdges);
}

document.addEventListener("DOMContentLoaded", async () => {
  try {
    const teamsResponse = await fetch("data/teams.json");
    const TEAMS = await teamsResponse.json();

    const tasksResponse = await fetch("data/tasks.json");
    const TASKS_DATA = await tasksResponse.json();

    initializeCytoscape(TASKS_DATA);
    populateTeamSelector(TEAMS);
    updateGraphStyles();
    animateEdges();
  } catch (error) {
    console.error("Failed to load map data:", error);
  }
});

window.addEventListener("resize", centerOnStartNodeDebounced);
