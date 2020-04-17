function script() {
  document.addEventListener("DOMContentLoaded", function(event) {
    startObserveForPosts();
  });

  function startObserveForPosts() {
    const targetNode = document.getElementById("slide-panel-container");

    const observer = new MutationObserver(onMutation);
    observer.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
    });
  }

  function onMutation(mutations) {
    processPosts(mutations);
  }

  function processPosts(mutations) {
    const found = [];

    for (let mutation of mutations) {
      if (mutation.type === "attributes") {
        if (mutation.attributeName === "data-id") {
          if (mutation.target.classList.contains("post_box")) {
            found.push(mutation.target);
          }
        }
      }

      for (const node of mutation.addedNodes) {
        if (!node.tagName) continue; // not an element

        if (node.classList.contains("post_box")) {
          found.push(node);
        } else if (node.firstElementChild) {
          found.push(...node.getElementsByClassName("post_box"));
        }
      }
    }

    found.forEach(handlePost);
  }

  function handlePost(node) {
    const postId = node.dataset.id;

    if (!postId) {
      console.log("post missing id", node);
      return;
    }

    const button = document.createElement("div");

    button.classList.add("ds-menu-button", "ds-menu-button-smd");
    button.style.backgroundColor = "rgb(255, 255, 255)";
    button.style.marginRight = "26px";

    const icon = document.createElement("i");
    icon.classList.add("icon", "icon-v2-surface-inbox2-o");

    button.append(icon);

    button.addEventListener("click", function() {
      console.log("send to inbox ", { postId });
      sendPostToInbox(+postId);
    });

    const sibling = node.querySelector(
      ".post_top_right_wrapper .post_time_wrapper"
    );
    sibling.parentNode.insertBefore(button, sibling.nextSibling);
  }

  function sendPostToInbox(postId) {
    findPostRefByPostId(postId).then((postRef) => {
      markPostRef(postRef.id, false);
    });
  }

  function findPostRefByPostId(postId, page = 1) {
    console.log("start find post_ref_id to", postId, page);
    return new Promise((resolve, reject) => {
      const boardId = document.location.pathname.split("/")[2];
      $.ajax({
        url: `/inbox/posts?board_id=${boardId}&per_page=25&page=${page}&only_open=false`,
        success: function(data, textStatus) {
          console.log("Success:", data, textStatus);

          const postRef = data.result.posts_data[postId];

          if (postRef) {
            console.log("post ref id found", postRef.id, "in page", page);
            return resolve(postRef);
          }

          console.log(
            `can't find post ${postId} in page #${page}, going to next`
          );
          findPostRefByPostId(postId, page + 1)
            .then(resolve)
            .catch(reject);
        },
        error: function(xhr, textStatus, error) {
          console.log("Error:", xhr, textStatus, error);
          reject(error);
        },
      });
    });
  }

  function markPostRef(postRefId, close) {
    $.ajax({
      type: "POST",
      url: "/inbox/mark_post_ref",
      data: {
        post_ref_id: postRefId,
        close,
      },
      success: function(data, textStatus) {
        console.log("Success:", data, textStatus);
      },
      error: function(xhr, textStatus, error) {
        console.log("Error:", xhr, textStatus, error);
      },
    });
  }
  //   window.addEventListener("message", function onMessage(event) {
  //     if (
  //       typeof event.data === "string" &&
  //       event.data.startsWith("send_to_inbox")
  //     ) {
  //       const postId = +event.data.split(":")[1];
  //       sendPostToInbox(postId);
  //     }
  //   });
}

function inject(fn) {
  const script = document.createElement("script");
  script.text = `(${fn.toString()})();`;
  document.documentElement.appendChild(script);
}

inject(script);
