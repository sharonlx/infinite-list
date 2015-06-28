var TouchScroller = require('./TouchScroller'),
    VerticalScroller = require('./VerticalScroller'),
    ScrollbarRenderer = require('./ScrollbarRenderer'),
    AnimationFrameHelper = require('./AnimationFrameHelper'),
    ListItemsRenderer = require('./ListItemsRenderer'),
    StyleHelpers = require('./StyleHelpers');
    DEFAULT_ITEM_HEIGHT = 2;

var InfiniteList = function (listConfig) {

    var config = {
            itemHeightGetter: null,
            itemRenderer: null,
            itemTypeGetter: null,
            pageFetcher: null,
            loadMoreRenderer: function(index, domElement){
                domElement.innerHTML = 'Loading...';
            },
            hasMore: false,
            itemsCount: 0
        },
        parentElement = null,
        parentElementHeight,
        rootElement = null,
        scrollElement = null,
        scrollbarRenderer = null,
        itemsRenderer = null,
        scroller = null,
        offsetDelta = 5000,
        listItemsOffsets = [],
        adjustedItems = {},
        topOffset = 0,
        scrollToIndex = 0,
        topItemOffset = 0,
        needsRender = true;

    for (key in listConfig){
        if (listConfig.hasOwnProperty(key)){
            config[key] = listConfig[key];
        }
    }

    var initialPageConfig = listConfig.initialPage;
    if (initialPageConfig){
        config.itemsCount = initialPageConfig.itemsCount || 0;
        config.hasMore = initialPageConfig.hasMore || false;
    }

    function attach(domElement, touchProvider){
        parentElement = domElement;
        initializeRootElement(domElement);
        scrollbarRenderer = new ScrollbarRenderer(rootElement);
        itemsRenderer = new ListItemsRenderer(domElement, scrollElement, config, loadMoreCallback);
        scroller = new VerticalScroller(
            parentElement,
            function (top) {
                topOffset = (top || 0);
                needsRender = true;
            },
            touchProvider
        );

        window.addEventListener('resize', refresh.bind(this));
        runAnimationLoop();
        refresh();
        return this;
    }

    function detach() {
        AnimationFrameHelper.stopAnimationLoop();
        parentElement.removeChild(rootElement);
        window.removeEventListener('resize', refresh.bind(this));
    }

    function runAnimationLoop(){
        AnimationFrameHelper.startAnimationLoop(function(){
            if (needsRender) {
                render();
            }
        });
    }

    function calculateHeights() {
        listItemsOffsets = [offsetDelta];
        for (var i = 1; i <= config.itemsCount || 0; ++i) {
            var currentRowHeight = config.itemHeightGetter ? config.itemHeightGetter(i - 1) : DEFAULT_ITEM_HEIGHT;
            listItemsOffsets[i] = listItemsOffsets[i - 1] + currentRowHeight;
        }
        adjustedItems = {};
    }

    function initializeRootElement(parentElement) {
        scrollElement = document.createElement('div');
        StyleHelpers.applyElementStyle(scrollElement, {
            position: 'absolute',
            top: 0,
            bottom: 0
        });

        rootElement = document.createElement('div');
        StyleHelpers.applyElementStyle(rootElement, {
            position: 'relative',
            height: parentElement.clientHeight + 'px',
            width: parentElement.clientWidth + 'px',
            overflow: 'hidden'
        });
        rootElement.appendChild(scrollElement);
        parentElement.appendChild(
            rootElement);
    };

    function updateScrollerDimentions(){

        var firstRenderedItem = itemsRenderer.getRenderedItems()[0];
        scroller.setDimensions(
            !firstRenderedItem || firstRenderedItem.getItemIndex() == 0 ? listItemsOffsets[0] : Number.MIN_SAFE_INTEGER,
            getListHeight(),
            parentElementHeight
        );
    }

    function refresh(){
        var topListItem = itemsRenderer.getRenderedItems()[0],
            topListItemIndex = topListItem && topListItem.getItemIndex() || 0,
            topItemStartsAt = getStartOffsetForIndex(topListItemIndex) || 0,
            differenceFromTop = topOffset - topItemStartsAt;

        parentElementHeight = parentElement.clientHeight;
        StyleHelpers.applyElementStyle(rootElement, {
            height: parentElement.clientHeight + 'px',
            width: parentElement.clientWidth + 'px'
        });
        itemsRenderer.refresh();
        calculateHeights();
        updateScrollerDimentions();
        scrollbarRenderer.refresh();
        scrollToItem(topListItemIndex, differenceFromTop);
    }

    function getListHeight(){
        return getStartOffsetForIndex(listItemsOffsets.length - 1) + (!config.hasMore ? 0 : DEFAULT_ITEM_HEIGHT);
    }

    function render() {
        var topItem = null,
            shiftTop = 0,
            bottomItem = null,
            shiftBottom = 0,
            scrollerNeedUpdate = false,
            renderedItems = itemsRenderer.getRenderedItems();

        if (renderedItems.length > 0) {
            if (renderedItems[0].getItemIndex() == 0 && topOffset < renderedItems[0].getItemOffset()) {
                topOffset = renderedItems[0].getItemOffset();
                scroller.scrollTo(topOffset);
                return;
            }
        }
        StyleHelpers.applyTransformStyle(scrollElement, 'matrix3d(1,0,0,0,0,1,0,0,0,0,1,0,0' + ',' + (-topOffset) + ', 0, 1)');
        scrollbarRenderer.render(topOffset, getListHeight());
        needsRender = itemsRenderer.render(topOffset, scrollToIndex, topItemOffset);
        renderedItems = itemsRenderer.getRenderedItems();


        if (renderedItems.length > 0) {
            topItem = renderedItems[0];
            bottomItem = renderedItems[renderedItems.length - 1];

            shiftItemOffsetIfNeeded(topItem.getItemIndex(), topItem.getItemOffset());
            shiftItemOffsetIfNeeded(bottomItem.getItemIndex() + 1, bottomItem.getItemOffset() + bottomItem.getItemHeight());
        }

        for (var i = 1; i < renderedItems.length - 1; ++i) {
            listItemsOffsets[renderedItems[i].getItemIndex()] = renderedItems[i].getItemOffset();
        }

        if (scrollerNeedUpdate) {
            updateScrollerDimentions();
        }

        scrollToIndex = null;
        topItemOffset = null;
    }

    function loadMoreCallback(){
        config.pageFetcher(config.itemsCount, function(pageItemsCount, hasMore){
            config.hasMore = hasMore;
            config.itemsCount += pageItemsCount;
            refresh();
        });
    }

    function scrollToItem(index, relativeOffset, animate) {
        topItemOffset = relativeOffset || 0;
        scrollToIndex = index;
        scroller.scrollTo(getStartOffsetForIndex(index), animate);
    }

    function refreshItemHeight(index){

        var renderedListItem = itemsRenderer.getRenderedItems().filter(function(rItem){
            return rItem.getItemIndex() == index;
        })[0];

        if (renderedListItem) {
            var newHeight = config.itemHeightGetter && config.itemHeightGetter(index),
                startOffset = listItemsOffsets[index];

            if (!newHeight) {
                renderedListItem.setItemHeight(newHeight = renderedListItem.getDomElement().clientHeight);
            }

            shiftItemOffsetIfNeeded(index + 1, startOffset + newHeight);
        }
    }

    function shiftItemOffsetIfNeeded(itemIndex, itemOffset) {
        var renderedListItems = itemsRenderer.getRenderedItems(),
            listItem = renderedListItems.filter(function(rItem){
                return rItem.getItemIndex() == itemIndex;
            })[0];

        var topShift = renderedListItems.length == 0 || renderedListItems[0].getItemIndex() > itemIndex || (listItem && listItem.getItemOffset() < topOffset);
        (topShift ? shiftTopOffsets : shiftBottomOffsets)(itemIndex, itemOffset);
    }

    function shiftTopOffsets(itemIndex, itemOffset) {
        var shiftTop = itemOffset - listItemsOffsets[itemIndex];
        if (shiftTop != 0) {
            for (var i = itemIndex; i >= 0; --i) {
                updateItemOffset(i, listItemsOffsets[i] + shiftTop);
            }
            updateScrollerDimentions();
        }
    }

    function shiftBottomOffsets(itemIndex, itemOffset) {
        if (itemIndex < listItemsOffsets.length) {
            var shiftBottom = itemOffset - listItemsOffsets[itemIndex];
            if (shiftBottom != 0) {
                for (var i = itemIndex; i < listItemsOffsets.length; ++i) {
                    updateItemOffset(i, listItemsOffsets[i] + shiftBottom);
                }
                updateScrollerDimentions();
            }
        }
    }

    function updateItemOffset(itemIndex, newOffset) {
        var renderedItems = itemsRenderer.getRenderedItems(),
            firstRenderedItem = itemsRenderer.getRenderedItems()[0],
            firstRenderedIndex = firstRenderedItem && firstRenderedItem.getItemIndex() || 0;

        listItemsOffsets[itemIndex]  = newOffset;
        if (renderedItems[itemIndex - firstRenderedIndex]) {
            renderedItems[itemIndex - firstRenderedIndex].setItemOffset(newOffset);
        }
    }

    function getStartOffsetForIndex (index) {
        return listItemsOffsets[index];
    }

    return {
        attach: attach,
        detach: detach,
        scrollToItem: scrollToItem,
        refresh: refresh,
        refreshItemHeight: refreshItemHeight
    }

};

module.exports = InfiniteList;