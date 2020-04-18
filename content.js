function script() {
  window.RefinedMonday = {};

  const cache = {
    postRefsByPostId: {},
    boardPostsFetching: {},
  };
  window.RefinedMonday.cache = cache;

  document.addEventListener("DOMContentLoaded", function(event) {
    startObserveForPosts();

    $(document).ajaxComplete(function(event, xhr, settings) {
      if (settings.url === "/inbox/mark_post_ref") {
        let [postRefID, close] = settings.data // "postRefID=4299100562&close=false"
          .split("&")
          .map((data) => JSON.parse(data.split("=")[1]));
        updatePostRefInCache(postRefID, close);
      }

      if (settings.url.startsWith("/inbox/posts?")) {
        console.log("/inbox/posts", settings, xhr);

        savePostRefsToCache(responseJSON.result.posts_data);
      }
    });
  });

  function updatePostRefInCache(postRefID, close) {
    console.log("after /inbox/mark_post_ref trying to update cache for", {
      postRefID,
      close,
    });

    const postIds = Object.keys(cache.postRefsByPostId);
    for (let i = 0; i < postIds.length; i++) {
      const postId = postIds[i];
      const postRef = cache.postRefsByPostId[postId];
      if (postRef.id === postRefID) {
        console.log("found post in cache", {
          postId,
          postRefID,
          close,
        });
        postRef.closed_at = close ? new Date().toString() : "";
        break;
      }
    }
  }

  function savePostRefsToCache(posts_data) {
    cache.postRefsByPostId = {
      ...cache.postRefsByPostId,
      ...posts_data,
    };
  }

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

    findPostRefByPostId(postId).then((postRef) => {
      console.log(
        "Insert inbox button for postId",
        postId,
        "with post ref",
        postRef
      );
      const button = document.createElement("button");

      button.classList.add("ds-menu-button", "ds-menu-button-smd");
      button.style.marginLeft = "-10px";
      button.style.marginRight = "24px";
      button.style.border = "none";
      button.style.padding = "0px";
      button.style.backgroundColor = "rgb(255, 255, 255)";

      let isClosed = !!postRef.closed_at;
      renderButtonIsClosed();

      function renderButtonIsClosed() {
        const icon = document.createElement("i");

        if (isClosed) {
          icon.classList.add("icon", "icon-v2-surface-inbox2-o");
        } else {
          icon.style.display = "block";
          icon.style.backgroundColor = "#009aff";
          icon.style.color = "#fff";
          icon.style.fontSize = "12px";
          icon.style.lineHeight = "26px";
          icon.style.width = "24px";
          icon.style.height = "24px";
          icon.style.borderRadius = "100%";
          icon.style.textAlign = "center";
          icon.classList.add("icon", "icon-dapulse-check-2");
        }

        if (button.firstChild) {
          button.replaceChild(icon, button.firstChild);
        } else {
          button.append(icon);
        }
      }

      button.addEventListener("click", function() {
        console.log("send to inbox ", { postId, postRef });

        button.disabled = true;
        isClosed = !isClosed;
        renderButtonIsClosed();

        if (isClosed) {
          window.Pulse.Apps.InboxCounter.decrease_count();
        } else {
          window.Pulse.Apps.InboxCounter.increase_count();
        }

        markPostRef(postRef.id, isClosed)
          .then(() => {
            button.disabled = false;
          })
          .catch(() => {
            button.disabled = false;
            if (isClosed) {
              window.Pulse.Apps.InboxCounter.increase_count();
            } else {
              window.Pulse.Apps.InboxCounter.decrease_count();
            }
            isClosed = !isClosed;
            renderButtonIsClosed();
          });
      });

      const sibling = node.querySelector(
        ".post_top_right_wrapper .post_time_wrapper"
      );
      sibling.parentNode.insertBefore(button, sibling.nextSibling);
    });
  }

  function findPostRefByPostId(postId, page = 1) {
    /* returned object will be:
      {
        id: 4296734433
        board_id: 532604006
        pulse_id: 532604119
        closed_at: ""
        wrote_it: true
        mentioned: null
        announced_to_all: null
        subscribed_to_item: true
        subscribed_to_board: true
      }
     */

    console.log("start find post_ref_id to", postId, page);
    return new Promise((resolve, reject) => {
      if (cache.postRefsByPostId[postId]) {
        console.log(
          "return post ref from cache",
          postId,
          cache.postRefsByPostId[postId]
        );
        return resolve(cache.postRefsByPostId[postId]);
      }

      const boardId = document.location.pathname.split("/")[2];
      fetchBoardPosts({ boardId, page }).then((data) => {
        // savePostRefsToCache(data.result.posts_data);

        const postRef = data.result.posts_data[postId];
        if (postRef) {
          console.log("post ref found", postRef.id, "in page", page);
          return resolve(postRef);
        }

        if (data.result.total_pages === page) {
          console.log("reach last page and didn't found post ref", {
            postId,
            page,
            data,
          });
          return resolve(null);
        }

        console.log(
          `can't find post ${postId} in page #${page}, going to next`
        );
        findPostRefByPostId(postId, page + 1)
          .then(resolve)
          .catch(reject);
      });
    });
  }

  function fetchBoardPosts({ boardId, page }) {
    const key = `board_id:${boardId}-page:${page}`;
    if (cache.boardPostsFetching[key]) {
      return cache.boardPostsFetching[key];
    }

    const fetching = new Promise((resolve, reject) => {
      $.ajax({
        url: `/inbox/posts?board_id=${boardId}&per_page=50&page=${page}&only_open=false`,
        success: function(data, textStatus) {
          /*
            result is looks like:
            {
              query: {board_id: "532604006", page: "1", per_page: "25"}
              result:
              posts_ids: (6) [693064302, 692899628, 692721160, 692720392, 692718426, 692717074]
              posts: {692717074: {…}, 692718426: {…}, 692720392: {…}, 692721160: {…}, 692899628: {…}, 693064302: {…}}
              posts_data: {692717074: {…}, 692718426: {…}, 692720392: {…}, 692721160: {…}, 692899628: {…}, 693064302: {…}}
              count: 6
              total_count: 6
              total_pages: 1
              last_post_id_fetched: 692717074
            }
          */
          console.log("Success:", data, textStatus);

          // delete fetching from cache
          delete cache.boardPostsFetching[key];
          resolve(data);
        },
        error: function(xhr, textStatus, error) {
          console.log("Error:", xhr, textStatus, error);
          reject(error);
        },
      });
    });

    cache.boardPostsFetching[key] = fetching;

    return fetching;
  }

  function markPostRef(postRefId, close) {
    console.log("mark post ref", { postRefId, close });
    return new Promise((resolve, reject) => {
      $.ajax({
        type: "POST",
        url: "/inbox/mark_post_ref",
        data: {
          post_ref_id: postRefId,
          close,
        },
        success: function(data, textStatus) {
          console.log("#mark_post_ref Success:", data, textStatus);
          resolve(data);
        },
        error: function(xhr, textStatus, error) {
          console.log("#mark_post_ref Error:", xhr, textStatus, error);
          reject(erro);
        },
      });
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
